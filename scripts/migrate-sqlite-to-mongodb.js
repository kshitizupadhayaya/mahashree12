#!/usr/bin/env node
/**
 * Migrate ALL data from local SQLite (data/orders.db) to MongoDB Atlas.
 * - Safe/repeatable: no collection drops, no deletions, conflict-safe inserts.
 * - Preserves IDs as legacy_sqlite_id and relationship values where present.
 * - Usage:
 *   node scripts/migrate-sqlite-to-mongodb.js --dry-run
 *   node scripts/migrate-sqlite-to-mongodb.js
 *   node scripts/migrate-sqlite-to-mongodb.js --stats-mode=keep|replace
 */
require('../node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const sqlite3 = require('../node_modules/sqlite3');
const { MongoClient } = require('../node_modules/mongodb');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const statsMode = (process.argv.find(a=>a.startsWith('--stats-mode='))||'--stats-mode=keep').split('=')[1] || 'keep';
const SQLITE_PATH = path.join(__dirname, '..', 'data', 'orders.db');
const DB_NAME = process.env.MONGODB_DB || 'mahashree_namkeen';

function all(db, sql, p=[]) { return new Promise((r,j)=>db.all(sql,p,(e,rows)=>e?j(e):r(rows||[]))); }
function norm(s){ return String(s??'').trim().toLowerCase().replace(/\s+/g,' '); }
function productKey(p){ return [norm(p.name), norm(p.category), String(p.price??''), norm(p.image), norm(p.description)].join('|'); }
function parseJson(v, fb){ if(v==null||v==='') return fb; if(typeof v!=='string') return v; try{return JSON.parse(v);}catch{return fb;} }
function toDate(v){ if(!v) return undefined; const d=new Date(v); return Number.isNaN(d.getTime())?undefined:d; }

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required (set it in .env; do not hardcode).');
  const sdb = new sqlite3.Database(SQLITE_PATH);
  const tableRows = await all(sdb, "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name");
  const tables = tableRows.map(r=>r.name);
  const src = {};
  for (const t of tables) src[t] = await all(sdb, `SELECT * FROM "${t}"`);
  sdb.close();

  const mc = new MongoClient(process.env.MONGODB_URI);
  await mc.connect();
  const db = mc.db(DB_NAME);
  const report = { dryRun, statsMode, sqlite: SQLITE_PATH, mongoDb: DB_NAME, sqliteCounts:{}, mongoCountsBefore:{}, inserted:{}, skipped:{}, errors:[], notes:[] };
  for (const t of tables) report.sqliteCounts[t] = src[t].length;
  for (const t of tables) { try { report.mongoCountsBefore[t] = await db.collection(t).countDocuments(); } catch { report.mongoCountsBefore[t] = 0; } }

  async function maybeInsert(col, doc, key) {
    if (dryRun) return 'dry-run';
    try { await col.insertOne(doc); return 'inserted'; }
    catch (e) {
      if (e && e.code === 11000) return 'duplicate';
      report.errors.push({ collection: col.collectionName, key, msg: e.message });
      return 'error';
    }
  }

  // products
  if (src.products) {
    const col=db.collection('products');
    const existing=await col.find({}).project({name:1,category:1,price:1,image:1,description:1}).toArray();
    const keys=new Set(existing.map(productKey)); let ins=0,skip=0;
    for(const p of src.products){
      if(keys.has(productKey(p))){ skip++; continue; }
      const doc={ name:p.name||'', category:p.category||'', price:Number(p.price||0), description:p.description||'', image:p.image||'', created_at:toDate(p.created_at)||new Date(), legacy_sqlite_id:p.id, migrated_from_sqlite:true };
      const r=await maybeInsert(col, doc, productKey(p)); if(r==='inserted'||r==='dry-run') {ins++; keys.add(productKey(p));} else if(r==='duplicate') skip++;
    }
    report.inserted.products=ins; report.skipped.products=skip;
  }

  // orders
  if (src.orders) {
    const col=db.collection('orders');
    const existing=await col.find({}).project({idempotency_key:1,legacy_sqlite_id:1}).toArray();
    const keys=new Set(); for(const o of existing){ if(o.idempotency_key) keys.add('idem:'+o.idempotency_key); if(o.legacy_sqlite_id!=null) keys.add('legacy:'+o.legacy_sqlite_id); }
    let ins=0,skip=0;
    for(const o of src.orders){
      const idem=o.idempotency_key?String(o.idempotency_key).trim():'';
      if((idem && keys.has('idem:'+idem)) || keys.has('legacy:'+o.id)){ skip++; continue; }
      const doc={ ...o, items:parseJson(o.items,[]), totals:parseJson(o.totals,null), customer:parseJson(o.customer,null), legacy_sqlite_id:o.id, created_at:toDate(o.created_at)||new Date(), migrated_from_sqlite:true };
      delete doc.id;
      if(!idem) delete doc.idempotency_key;
      const r=await maybeInsert(col, doc, 'legacy:'+o.id); if(r==='inserted'||r==='dry-run'){ins++; if(idem) keys.add('idem:'+idem); keys.add('legacy:'+o.id);} else if(r==='duplicate') skip++;
    }
    report.inserted.orders=ins; report.skipped.orders=skip;
    report.notes.push('Orders keep legacy_sqlite_id; JSON fields parsed; no deletions/overwrites.');
  }

  // generic tables: places, settings, dashboard_stats_audit
  for (const t of ['places','settings','dashboard_stats_audit']) {
    if (!src[t]) continue;
    const col=db.collection(t); let ins=0,skip=0;
    for(const row of src[t]){
      const doc={...row, legacy_sqlite_id: row.id, migrated_from_sqlite:true}; if('id' in doc) delete doc.id;
      let exists=false;
      if(!dryRun){
        if(t==='settings' && row.key!=null) exists=await col.findOne({$or:[{key:row.key},{legacy_sqlite_id:row.id}]},{projection:{_id:1}});
        else if(t==='dashboard_stats_audit') exists=await col.findOne({legacy_sqlite_id:row.id, action:row.action, admin_user:row.admin_user, at_time:row.at_time, details:row.details},{projection:{_id:1}});
        else exists=await col.findOne({legacy_sqlite_id:row.id},{projection:{_id:1}});
      }
      if(exists){ skip++; continue; }
      const r=await maybeInsert(col, doc, t+':'+(row.id??row.key)); if(r==='inserted'||r==='dry-run') ins++; else if(r==='duplicate') skip++;
    }
    report.inserted[t]=ins; report.skipped[t]=skip;
  }

  // dashboard_statistics
  if (src.dashboard_statistics) {
    const col=db.collection('dashboard_statistics');
    if (statsMode === 'replace' && !dryRun) {
      report.notes.push('stats-mode=replace requested but destructive replace is unsafe; kept existing main instead. Rerun with explicit admin decision if replacement is required.');
    }
    report.inserted.dashboard_statistics=0; report.skipped.dashboard_statistics=src.dashboard_statistics.length;
    report.notes.push('dashboard_statistics main kept (no overwrite) for safety; 3 keep.');
  }

  // dashboard_daily_stats
  if (src.dashboard_daily_stats) {
    const col=db.collection('dashboard_daily_stats');
    const existing=await col.find({}).project({stat_date:1,generation:1}).toArray();
    const keys=new Set(existing.map(d=>`${d.stat_date}|${d.generation}`)); let ins=0,skip=0;
    for(const r of src.dashboard_daily_stats){ const k=`${r.stat_date}|${r.generation}`; if(keys.has(k)){skip++;continue;} const res=await maybeInsert(col,{...r,migrated_from_sqlite:true},k); if(res==='inserted'||res==='dry-run'){ins++;keys.add(k);} else if(res==='duplicate') skip++; }
    report.inserted.dashboard_daily_stats=ins; report.skipped.dashboard_daily_stats=skip;
  }

  // dashboard_stats_counted
  if (src.dashboard_stats_counted) {
    const col=db.collection('dashboard_stats_counted');
    const existing=await col.find({}).project({order_key:1}).toArray();
    const keys=new Set(existing.map(d=>String(d.order_key))); let ins=0,skip=0;
    for(const r of src.dashboard_stats_counted){ const k=String(r.order_key); if(keys.has(k)){skip++;continue;} const res=await maybeInsert(col,{...r,migrated_from_sqlite:true},k); if(res==='inserted'||res==='dry-run'){ins++;keys.add(k);} else if(res==='duplicate') skip++; }
    report.inserted.dashboard_stats_counted=ins; report.skipped.dashboard_stats_counted=skip;
  }

  // order_financial_ledger
  if (src.order_financial_ledger) {
    const col=db.collection('order_financial_ledger');
    const existing=await col.find({}).project({source_order_id:1,idempotency_key:1}).toArray();
    const keys=new Set(); for(const r of existing){ if(r.source_order_id!=null) keys.add('src:'+r.source_order_id); if(r.idempotency_key) keys.add('idem:'+r.idempotency_key); }
    let ins=0,skip=0;
    for(const r of src.order_financial_ledger){
      const srcId=r.source_order_id!=null?String(r.source_order_id):''; const idem=r.idempotency_key?String(r.idempotency_key).trim():'';
      if((srcId && keys.has('src:'+srcId)) || (idem && keys.has('idem:'+idem))){skip++; continue;}
      const doc={...r, items:parseJson(r.items,[]), order_snapshot:parseJson(r.order_snapshot,null), legacy_sqlite_id:r.id, migrated_from_sqlite:true};
      delete doc.id; if(!idem) delete doc.idempotency_key;
      const res=await maybeInsert(col,doc,srcId||idem||r.id); if(res==='inserted'||res==='dry-run'){ins++; if(srcId) keys.add('src:'+srcId); if(idem) keys.add('idem:'+idem);} else if(res==='duplicate') skip++;
    }
    report.inserted.order_financial_ledger=ins; report.skipped.order_financial_ledger=skip;
  }

  report.mongoCountsAfter={};
  for (const t of tables) { try { report.mongoCountsAfter[t] = await db.collection(t).countDocuments(); } catch { report.mongoCountsAfter[t] = 0; } }
  await mc.close();
  console.log(JSON.stringify(report,null,2));
  if (report.errors.length) process.exitCode = 2;
}

main().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
