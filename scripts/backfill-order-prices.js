#!/usr/bin/env node
/**
 * One-time backfill: recalculate subtotal/total for orders with 0/missing money
 * using stored item snapshots first, then current product DB prices as fallback.
 * Orders whose prices cannot be resolved are listed and NOT guessed/changed.
 *
 * Usage: node scripts/backfill-order-prices.js           (dry-run)
 *        node scripts/backfill-order-prices.js --apply   (writes changes)
 */
require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'orders.db');
const APPLY = process.argv.includes('--apply');

function parseMoney(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const n = Number(String(v).replace(/NPR|Rs\.?|,|\s/gi, '').trim());
  return Number.isFinite(n) ? n : NaN;
}
function money(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function parseItems(v) { try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch { return []; } }

const db = new sqlite3.Database(DB_PATH);
const all = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r || [])));
const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));

(async () => {
  const orders = await all(`SELECT * FROM orders ORDER BY id ASC`);
  const products = await all(`SELECT id, name, price FROM products`).catch(() => []);
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const report = { mode: APPLY ? 'apply' : 'dry-run', scanned: orders.length, candidates: 0, unchanged: 0, updated: [], unresolved: [] };

  for (const order of orders) {
    const total = parseMoney(order.total);
    const subtotal = parseMoney(order.subtotal);
    const items = parseItems(order.items);
    const needs = !Number.isFinite(total) || total <= 0 || !Number.isFinite(subtotal) || subtotal < 0 || items.some((i) => !(parseMoney(i.price ?? i.unit_price ?? i.unitPrice) > 0));
    if (!needs) { report.unchanged++; continue; }
    report.candidates++;

    const resolved = [];
    const missing = [];
    for (const item of items) {
      const pid = String(item.productId ?? item.id ?? item.product_id ?? '');
      const qty = Math.max(1, Math.floor(parseMoney(item.quantity) || 1));
      let price = parseMoney(item.price ?? item.unit_price ?? item.unitPrice);
      let source = 'snapshot';
      if (!(price > 0) && pid && byId.has(pid)) { price = parseMoney(byId.get(pid).price); source = 'product_db'; }
      if (!(price > 0)) {
        missing.push({ productId: pid || null, name: item.name || null, quantity: qty, reason: byId.has(pid) ? 'product has no valid price' : 'missing item price and product not found' });
      } else {
        resolved.push({ productId: pid || item.productId || null, name: String(item.name || byId.get(pid)?.name || 'Product'), image: String(item.image || ''), price: money(price), quantity: qty, lineTotal: money(price * qty), _source: source });
      }
    }

    if (missing.length || !resolved.length) {
      report.unresolved.push({ orderId: order.id, status: order.status, missing });
      continue;
    }

    const newSubtotal = money(resolved.reduce((s, i) => s + i.lineTotal, 0));
    const delivery = parseMoney(order.delivery_charge);
    // Delivery/discount removed from pricing: total = subtotal. Keep DB columns safe (0) for old orders.
    const newDelivery = 0; const newDiscount = 0;
    const newTotal = money(Math.max(0, newSubtotal));
    const cleanItems = resolved.map(({ _source, ...i }) => i);
    const totals = { subtotal: newSubtotal, deliveryCharge: newDelivery, discount: newDiscount, total: newTotal, itemCount: cleanItems.reduce((s, i) => s + i.quantity, 0), backfilled: true };

    report.updated.push({ orderId: order.id, status: order.status, old: { total: order.total, subtotal: order.subtotal }, new: { total: newTotal, subtotal: newSubtotal, deliveryCharge: newDelivery, discount: newDiscount, items: cleanItems } });
    if (APPLY) {
      await run(`UPDATE orders SET items=?, subtotal=?, delivery_charge=?, discount=?, total=?, totals=? WHERE id=?`,
        [JSON.stringify(cleanItems), newSubtotal, newDelivery, newDiscount, newTotal, JSON.stringify(totals), order.id]);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  db.close();
})().catch((e) => { console.error(e); process.exit(1); });
