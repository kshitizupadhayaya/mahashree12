const CART_VERSION = 2;
const cartKey = 'maha-cart';
const savedKey = 'maha-saved';
const customerKey = 'maha-customer';
window.__mahaAppInitialized = true;

const menuBtn = document.getElementById('menu-btn');
const sidebar = document.getElementById('site-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const menuTrigger = menuBtn;
const menuPanel = sidebar;
const menuOverlay = sidebarOverlay;
const closeMenuButton = sidebarCloseBtn;
const filterButtons = document.querySelectorAll('.filter-btn');
const testimonials = document.querySelectorAll('.testimonial');
const prevButton = document.querySelector('.slide-arrow.prev');
const nextButton = document.querySelector('.slide-arrow.next');
const yearElement = document.getElementById('year');
const cartPanel = document.querySelector('.cart-panel');
const cartOverlay = document.querySelector('.cart-overlay');
const cartItemsContainer = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const subtotalElement = document.getElementById('subtotal');
const orderForm = document.getElementById('order-form');
const productGrid = document.getElementById('products-grid') || document.querySelector('.product-grid');
const priceListContainer = document.getElementById('price-list-container');
const authModal = document.getElementById('auth-modal');
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
const userButton = document.getElementById('user-button');
const userLabel = document.getElementById('user-label');
const authCloseButton = document.querySelector('.auth-close');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authStorageKey = 'maha-auth';
const purchaseHistoryKey = 'maha-purchase-history';
const priceSortButton = document.getElementById('price-sort-btn');
const userPanel = document.getElementById('user-panel');
const userCloseButton = document.getElementById('user-close');
const userLogoutButton = document.getElementById('user-logout');
let priceSortDirection = 'desc';
let catalogProducts = [];

const normalizeCartItem = (item) => {
  if (!item) return null;
  const id = String(item.productId ?? item.id ?? '').trim();
  if (!id) return null;
  const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
  return {
    productId: id,
    id,
    name: String(item.name || 'Product'),
    price: Number(item.price || 0),
    image: String(item.image || ''),
    description: String(item.description || ''),
    quantity,
    selected: item.selected !== false,
    savedForLater: !!item.savedForLater,
    inStock: item.inStock !== false,
  };
};

const readJson = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const loadCartState = () => {
  const raw = readJson(cartKey, null);
  if (raw && !Array.isArray(raw) && Array.isArray(raw.items)) {
    return { version: CART_VERSION, items: raw.items.map(normalizeCartItem).filter(Boolean), saved: (raw.saved || []).map(normalizeCartItem).filter(Boolean).map((i) => ({ ...i, selected: false, savedForLater: true })) };
  }
  if (Array.isArray(raw)) {
    return { version: CART_VERSION, items: raw.map(normalizeCartItem).filter(Boolean), saved: (readJson(savedKey, []) || []).map(normalizeCartItem).filter(Boolean).map((i) => ({ ...i, selected: false, savedForLater: true })) };
  }
  return { version: CART_VERSION, items: [], saved: (readJson(savedKey, []) || []).map(normalizeCartItem).filter(Boolean).map((i) => ({ ...i, selected: false, savedForLater: true })) };
};
const saveCartState = (state) => {
  writeJson(cartKey, { version: CART_VERSION, items: (state.items || []).map(normalizeCartItem).filter(Boolean), saved: (state.saved || []).map(normalizeCartItem).filter(Boolean) });
  try { localStorage.setItem(savedKey, JSON.stringify(state.saved || [])); } catch {}
};
const loadCart = () => loadCartState().items;
const saveCart = (cart) => { const state = loadCartState(); state.items = cart; saveCartState(state); };



const openMenu = () => {
  sidebar?.classList.add('open');
  sidebarOverlay?.classList.add('visible');
  menuBtn?.setAttribute('aria-expanded', 'true');
  sidebar?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('menu-open');
};
const closeMenu = () => {
  sidebar?.classList.remove('open');
  sidebarOverlay?.classList.remove('visible');
  menuBtn?.setAttribute('aria-expanded', 'false');
  sidebar?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('menu-open');
};
menuBtn?.addEventListener('click', (e) => { e.preventDefault(); sidebar?.classList.contains('open') ? closeMenu() : openMenu(); });
sidebarCloseBtn?.addEventListener('click', closeMenu);
sidebarOverlay?.addEventListener('click', closeMenu);
sidebar?.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeCart(); closeUserPanel?.(); } });

const pageTitles = {
  home: 'Mahashree Namkeen | Premium Snacks & Spice Mixes',
  categories: 'Categories | Mahashree Namkeen',
  places: 'Places | Mahashree Namkeen',
  about: 'About | Mahashree Namkeen',
  products: 'Products | Mahashree Namkeen',
  price: 'Price List | Mahashree Namkeen',
  app: 'App | Mahashree Namkeen',
  user: 'User Account | Mahashree Namkeen',
  login: 'Login | Mahashree Namkeen',
};

const queryPage = new URLSearchParams(window.location.search).get('page');
const requestedPage = queryPage || window.location.pathname.replace(/\/+$/, '').split('/').pop();
const currentPage = pageTitles[requestedPage] ? requestedPage : 'home';
const mainContent = document.querySelector('.page-main');

document.querySelectorAll('[data-page-view]').forEach((view) => {
  if (mainContent && !mainContent.contains(view)) mainContent.append(view);
});

document.body.dataset.page = currentPage;
document.title = pageTitles[currentPage];
document.querySelectorAll('a[href^="/"]').forEach((link) => {
  const route = link.getAttribute('href').replace(/^\/+|\/+$/g, '') || 'home';
  if (!pageTitles[route]) return;
  link.href = window.location.protocol === 'file:'
    ? `index.html?page=${route}`
    : route === 'home' ? '/' : `/${route}`;
});
document.querySelectorAll('[data-page-view]').forEach((view) => {
  view.hidden = view.dataset.pageView !== currentPage;
});
document.querySelectorAll('[data-page-route]').forEach((link) => {
  const active = link.dataset.pageRoute === currentPage;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
});

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getStoredUser = () => {
  try {
    const stored = localStorage.getItem(authStorageKey);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
};

const saveUser = (user) => localStorage.setItem(authStorageKey, JSON.stringify(user));
const clearUser = () => localStorage.removeItem(authStorageKey);


const getStoredCustomer = () => {
  try {
    const stored = localStorage.getItem(customerKey);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
};
const saveCustomer = (customer) => localStorage.setItem(customerKey, JSON.stringify(customer));

const formatCurrency = (value) => `NPR ${Number(value || 0).toFixed(0)}`;

const getPurchaseHistory = () => {
  try {
    const stored = localStorage.getItem(purchaseHistoryKey);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
};

const savePurchaseHistory = (entries) => localStorage.setItem(purchaseHistoryKey, JSON.stringify(entries));

const renderUserState = () => {
  const user = getStoredUser();
  if (!userButton || !userLabel) return;

  if (user && user.name) {
    const firstName = user.name.split(' ')[0];
    userLabel.textContent = firstName;
    userButton.title = `Signed in as ${user.name}`;
    return;
  }

  userLabel.textContent = 'Login';
  userButton.title = 'Login or register';
};

const openUserPanel = () => {
  if (!userPanel) return;
  renderUserPanel();
  userPanel.classList.add('open');
  userPanel.setAttribute('aria-hidden', 'false');
};

const closeUserPanel = () => {
  if (!userPanel) return;
  userPanel.classList.remove('open');
  userPanel.setAttribute('aria-hidden', 'true');
};

const renderUserContent = ({
  nameEl,
  providerEl,
  mobileEl,
  emailEl,
  avatarEl,
  cartItemsEl,
  purchaseItemsEl,
}) => {
  const user = getStoredUser();

  if (!user) {
    if (nameEl) nameEl.textContent = 'Guest';
    if (providerEl) providerEl.textContent = 'Not signed in';
    if (mobileEl) mobileEl.textContent = '-';
    if (emailEl) emailEl.textContent = '-';
    if (avatarEl) avatarEl.textContent = 'G';
  } else {
    const firstLetter = (user.name || user.mobile || 'U').charAt(0).toUpperCase();
    if (avatarEl) avatarEl.textContent = firstLetter;
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (providerEl) providerEl.textContent = user.provider === 'google' ? 'Google account' : 'Local account';
    if (mobileEl) mobileEl.textContent = user.mobile || '-';
    if (emailEl) emailEl.textContent = user.email || '-';
  }

  const cart = loadCart();
  if (cartItemsEl) {
    if (!cart.length) {
      cartItemsEl.innerHTML = '<div class="user-empty">No items in your cart.</div>';
    } else {
      cartItemsEl.innerHTML = cart.map((item) => `
        <div class="user-item">
          <span>${escapeHtml(item.name)}${item.selected === false ? ' (not selected)' : ''}</span>
          <strong>${Number(item.quantity||1)} × ${formatCurrency(item.price)}</strong>
        </div>
      `).join('');
    }
  }

  const history = getPurchaseHistory();
  if (purchaseItemsEl) {
    if (!history.length) {
      purchaseItemsEl.innerHTML = '<div class="user-empty">No purchased products yet.</div>';
      return;
    }
    purchaseItemsEl.innerHTML = history.map((entry) => {
      const items = (Array.isArray(entry.items) ? entry.items : []).map((item) => `<span class="user-history-item">${escapeHtml(item.name)} ×${Number(item.quantity||1)}</span>`).join('');
      const status = escapeHtml(entry.status || 'pending');
      return `<div class="user-order-card" data-order-id="${escapeHtml(entry.orderId || '')}">
        <div class="user-order-head"><strong>Order ${entry.orderId ? '#' + escapeHtml(entry.orderId) : ''}</strong><span class="user-order-status status-${status.toLowerCase().replace(/[^a-z]/g,'')}">${status}</span></div>
        <div class="user-order-meta">${formatCurrency(entry.total)} · ${escapeHtml(entry.paymentMethod || 'Cash on Delivery')} · ${escapeHtml(entry.paymentStatus || 'Pending')}</div>
        <div class="user-order-items">${items || '<span class="user-history-item">Items unavailable</span>'}</div>
        <div class="user-order-meta">${entry.purchasedAt ? escapeHtml(new Date(entry.purchasedAt).toLocaleString()) : ''}</div>
      </div>`;
    }).join('');
  }
};

const renderUserPanel = () => {
  const user = getStoredUser();
  if (!userPanel) return;

  const name = document.getElementById('user-panel-name');
  const provider = document.getElementById('user-panel-provider');
  const mobile = document.getElementById('user-panel-mobile');
  const email = document.getElementById('user-panel-email');
  const avatar = document.querySelector('.user-avatar');
  const cartItemsContainer = document.getElementById('user-cart-items');
  const purchaseItemsContainer = document.getElementById('user-purchase-items');

  renderUserContent({
    nameEl: name,
    providerEl: provider,
    mobileEl: mobile,
    emailEl: email,
    avatarEl: avatar,
    cartItemsEl: cartItemsContainer,
    purchaseItemsEl: purchaseItemsContainer,
  });

  if (!user) {
    if (avatar) avatar.textContent = 'G';
  }
};

const renderUserPage = () => {
  const loginButton = document.getElementById('user-page-login');
  if (loginButton) loginButton.hidden = Boolean(getStoredUser());

  const name = document.getElementById('user-page-name');
  const provider = document.getElementById('user-page-provider');
  const mobile = document.getElementById('user-page-mobile');
  const email = document.getElementById('user-page-email');
  const avatar = document.getElementById('user-page-avatar');
  const cartItemsContainer = document.getElementById('user-page-cart-items');
  const purchaseItemsContainer = document.getElementById('user-page-purchase-items');

  renderUserContent({
    nameEl: name,
    providerEl: provider,
    mobileEl: mobile,
    emailEl: email,
    avatarEl: avatar,
    cartItemsEl: cartItemsContainer,
    purchaseItemsEl: purchaseItemsContainer,
  });
};


const openCart = () => { cartPanel?.classList.add('open'); cartOverlay?.classList.add('visible'); };
const closeCart = () => { cartPanel?.classList.remove('open'); cartOverlay?.classList.remove('visible'); };

let cartBadgeCount = 0;
const getActiveItems = (state) => (state?.items || []).filter((i) => !i.savedForLater);
const getSavedItems = (state) => (state?.saved || []);
const selectedItems = (state) => getActiveItems(state).filter((i) => i.selected !== false && i.inStock !== false);
const cartTotals = (state) => {
  const active = getActiveItems(state);
  const selected = selectedItems(state);
  const subtotal = selected.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0);
  const total = Math.max(0, subtotal); // server recalculates; delivery/discount removed
  return { subtotal, deliveryCharge: 0, discount: 0, total, selectedCount: selected.reduce((s,i)=>s+Number(i.quantity||0),0), itemCount: active.reduce((s,i)=>s+Number(i.quantity||0),0) };
};

const updateCartBadge = () => {
  const state = loadCartState();
  cartBadgeCount = getActiveItems(state).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const badge = document.getElementById('cart-badge');
  if (badge) { badge.textContent = cartBadgeCount; badge.style.display = cartBadgeCount > 0 ? 'grid' : 'none'; }
  if (cartCount) cartCount.textContent = String(cartBadgeCount);
};


const renderCart = () => {
  const state = loadCartState();
  const active = getActiveItems(state);
  const saved = getSavedItems(state);
  const totals = cartTotals(state);
  if (subtotalElement) subtotalElement.textContent = formatCurrency(totals.total);
  updateCartBadge();

  let container = document.getElementById('cart-items') || cartItemsContainer;
  const summary = document.querySelector('.cart-summary');
  if (!container) return;

  if (!active.length && !saved.length) {
    container.innerHTML = `<div class="amz-empty"><p class="amz-empty-title">Your Shopping Cart is empty</p><p class="amz-empty-sub">Browse products and add items to your cart.</p><a class="btn btn-primary" href="/products">Shop now</a></div>`;
    if (summary) summary.classList.add('is-empty');
    syncCheckoutState(state);
    return;
  }
  if (summary) summary.classList.remove('is-empty');

  const allSelected = active.length > 0 && active.every((i) => i.selected !== false);
  container.innerHTML = `
    <div class="amz-cart-head">
      <h3>Shopping Cart</h3>
      <button type="button" class="amz-link-btn" id="amz-select-all">${allSelected ? 'Deselect all items' : 'Select all items'}</button>
      <p class="amz-price-col">Price</p>
    </div>
<div class="amz-items">
      ${active.map((item) => {
        const checked = item.selected !== false ? 'checked' : '';
        const oos = item.inStock === false;
        return `
        <article class="amz-item ${oos ? 'oos' : ''}" data-id="${escapeHtml(item.productId)}">
          <label class="amz-select"><input type="checkbox" class="amz-item-select" data-id="${escapeHtml(item.productId)}" ${checked} ${oos ? 'disabled' : ''} aria-label="Select ${escapeHtml(item.name)}" /></label>
          <div class="amz-thumb"><img src="${escapeHtml(item.image || 'https://via.placeholder.com/160?text=Product')}" alt="${escapeHtml(item.name)}" loading="lazy" /></div>
          <div class="amz-info">
            <h4 class="amz-name">${escapeHtml(item.name)}</h4>
            <div class="amz-stock ${oos ? 'bad' : 'ok'}">${oos ? 'Currently unavailable' : 'In Stock'}</div>
<div class="amz-meta">FREE Returns</div>
            <div class="amz-actions-row">
              <div class="amz-qty" aria-label="Quantity controls">
                <button type="button" class="amz-qty-btn" data-action="decrease" data-id="${escapeHtml(item.productId)}" aria-label="Decrease quantity">−</button>
                <output class="amz-qty-val" aria-live="polite">${Number(item.quantity || 1)}</output>
                <button type="button" class="amz-qty-btn" data-action="increase" data-id="${escapeHtml(item.productId)}" aria-label="Increase quantity">+</button>
              </div>
              <span class="amz-sep">|</span>
              <button type="button" class="amz-link-btn" data-action="delete" data-id="${escapeHtml(item.productId)}">Delete</button>
              <span class="amz-sep">|</span>
              <button type="button" class="amz-link-btn" data-action="save" data-id="${escapeHtml(item.productId)}">Save for later</button>
              <span class="amz-sep">|</span>
              <button type="button" class="amz-link-btn" data-action="compare" data-id="${escapeHtml(item.productId)}">Compare with similar items</button>
              <span class="amz-sep">|</span>
              <button type="button" class="amz-link-btn" data-action="share" data-id="${escapeHtml(item.productId)}">Share</button>
            </div>
          </div>
          <div class="amz-price">${formatCurrency(item.price)}<small>${formatCurrency(Number(item.price||0)*Number(item.quantity||1))} total</small></div>
        </article>`;
      }).join('')}
    </div>
    <div class="amz-subtotal-bar">Subtotal (${totals.selectedCount} item${totals.selectedCount === 1 ? '' : 's'}): <strong>${formatCurrency(totals.subtotal)}</strong></div>
    ${saved.length ? `
      <section class="amz-saved" aria-label="Saved for later">
        <h4>Saved for later (${saved.length} item${saved.length===1?'':'s'})</h4>
        <div class="amz-saved-grid">
          ${saved.map((item) => `
            <article class="amz-saved-card" data-id="${escapeHtml(item.productId)}">
              <img src="${escapeHtml(item.image || 'https://via.placeholder.com/120?text=Product')}" alt="${escapeHtml(item.name)}" />
              <h5>${escapeHtml(item.name)}</h5>
              <div class="amz-price">${formatCurrency(item.price)}</div>
              <div class="amz-stock ok">In Stock</div>
              <button type="button" class="btn btn-secondary amz-move" data-action="move-to-cart" data-id="${escapeHtml(item.productId)}">Move to Cart</button>
              <button type="button" class="amz-link-btn" data-action="delete-saved" data-id="${escapeHtml(item.productId)}">Delete</button>
            </article>
          `).join('')}
        </div>
      </section>` : ''}
  `;

  syncCheckoutState(state);
};

const syncCheckoutState = (state) => {
  const s = state || loadCartState();
  const totals = cartTotals(s);
  const selected = selectedItems(s);
  const el = (id) => document.getElementById(id);
  if (el('amz-checkout-subtotal')) el('amz-checkout-subtotal').textContent = formatCurrency(totals.subtotal);
  if (el('amz-checkout-total')) el('amz-checkout-total').textContent = formatCurrency(totals.total);
  if (el('amz-checkout-count')) el('amz-checkout-count').textContent = `${totals.selectedCount} item${totals.selectedCount===1?'':'s'}`;
  const submit = orderForm?.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = selected.length === 0;
    submit.textContent = selected.length ? `Proceed to Checkout (${totals.selectedCount})` : 'Select items to checkout';
  }
};

const mutateCart = (fn) => { const state = loadCartState(); fn(state); saveCartState(state); renderCart(); renderUserPanel(); renderUserPage(); };

const parsePriceValue = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const n = Number(String(v).replace(/NPR|Rs\.?|,|\s/gi, '').trim());
  return Number.isFinite(n) ? n : NaN;
};
const addToCart = (product, btn) => {
  if (!product || (!product.productId && !product.id)) return;
  const price = parsePriceValue(product.price);
  if (!(price > 0)) { showToast(`${escapeHtml(product.name || 'Product')} has no valid price and cannot be added.`); return; }
  const pid = String(product.productId || product.id);
  mutateCart((state) => {
    const existing = getActiveItems(state).find((i) => i.productId === pid);
    if (existing) { existing.quantity += 1; existing.selected = true; existing.inStock = product.inStock !== false; existing.price = price; }
    else {
      // move from saved if present
      const savedIdx = (state.saved || []).findIndex((i) => i.productId === pid);
      if (savedIdx >= 0) { const s = state.saved.splice(savedIdx,1)[0]; state.items.push({ ...s, price, quantity: 1, selected: true, savedForLater: false, inStock: product.inStock !== false }); }
      else state.items.push(normalizeCartItem({ ...product, price, productId: pid, quantity: 1, selected: true }));
    }
  });
  openCart();
  if (btn) { btn.classList.add('added'); setTimeout(() => btn.classList.remove('added'), 500); }
  showToast(`${escapeHtml(product.name || 'Product')} added to cart`);
};

const updateItemQuantity = (id, change) => {
  mutateCart((state) => {
    const item = getActiveItems(state).find((i) => i.productId === String(id));
    if (!item) return;
    item.quantity = Math.max(1, Number(item.quantity || 1) + Number(change || 0));
  });
};

const removeFromCart = (id) => {
  mutateCart((state) => { state.items = getActiveItems(state).filter((i) => i.productId !== String(id)); });
};

const setSelected = (id, selected) => {
  mutateCart((state) => { const item = getActiveItems(state).find((i) => i.productId === String(id)); if (item && item.inStock !== false) item.selected = !!selected; });
};

const setSelectAll = (selected) => {
  mutateCart((state) => { getActiveItems(state).forEach((i) => { if (i.inStock !== false) i.selected = !!selected; }); });
};

const saveForLater = (id) => {
  mutateCart((state) => {
    const idx = getActiveItems(state).findIndex((i) => i.productId === String(id));
    if (idx < 0) return;
    const [item] = state.items.splice(idx, 1);
    state.saved = state.saved || [];
    if (!state.saved.find((s) => s.productId === item.productId)) state.saved.unshift({ ...item, selected: false, savedForLater: true, quantity: 1 });
  });
};

const moveToCart = (id) => {
  mutateCart((state) => {
    state.saved = state.saved || [];
    const idx = state.saved.findIndex((i) => i.productId === String(id));
    if (idx < 0) return;
    const [item] = state.saved.splice(idx, 1);
    const existing = getActiveItems(state).find((i) => i.productId === item.productId);
    if (existing) { existing.quantity += 1; existing.selected = true; }
    else state.items.push({ ...item, quantity: 1, selected: true, savedForLater: false });
  });
};

const deleteSaved = (id) => { mutateCart((state) => { state.saved = (state.saved || []).filter((i) => i.productId !== String(id)); }); };

const shareProduct = async (id) => {
  const state = loadCartState();
  const item = [...getActiveItems(state), ...getSavedItems(state)].find((i) => i.productId === String(id));
  if (!item) return;
  const url = `${location.origin}/products?product=${encodeURIComponent(item.productId)}`;
  const data = { title: item.name, text: `${item.name} - ${formatCurrency(item.price)}`, url };
  try {
    if (navigator.share) await navigator.share(data);
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); showToast('Product link copied'); }
    else { prompt('Copy product link', url); }
  } catch (_) {}
};

const compareProduct = (id) => {
  const state = loadCartState();
  const item = getActiveItems(state).find((i) => i.productId === String(id));
  if (!item) return;
  location.href = `/products?compare=${encodeURIComponent(item.productId)}`;
};

document.querySelectorAll('.cart-trigger').forEach((button) => button.addEventListener('click', openCart));
document.querySelector('.close-cart')?.addEventListener('click', closeCart);
cartOverlay?.addEventListener('click', closeCart);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCart(); });

document.addEventListener('click', async (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (target.id === 'amz-select-all') {
    const state = loadCartState(); const active = getActiveItems(state);
    setSelectAll(!(active.length > 0 && active.every((i) => i.selected !== false)));
    return;
  }
  const btn = target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!id) return;
  if (action === 'increase') updateItemQuantity(id, 1);
  else if (action === 'decrease') updateItemQuantity(id, -1);
  else if (action === 'delete') removeFromCart(id);
  else if (action === 'save') saveForLater(id);
  else if (action === 'move-to-cart') moveToCart(id);
  else if (action === 'delete-saved') deleteSaved(id);
  else if (action === 'share') shareProduct(id);
  else if (action === 'compare') compareProduct(id);
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.classList.contains('amz-item-select') && target.dataset.id) setSelected(target.dataset.id, target.checked);
});

let orderSubmitting = false;
let lastIdempotencyKey = '';
orderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (orderSubmitting) return;
  const state = loadCartState();
  const selected = selectedItems(state);
  if (!selected.length) { showToast('Select at least one available item to checkout.'); return; }
  const formData = new FormData(orderForm);
  const customerName = String(formData.get('customerName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const note = String(formData.get('note') || '').trim();
  const paymentMethod = String(formData.get('paymentMethod') || 'Cash on Delivery').trim();
  if (!customerName || !phone || !address) { alert('Name, phone, and delivery address are required.'); return; }
  const totals = cartTotals(state);
  lastIdempotencyKey = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    idempotencyKey: lastIdempotencyKey,
    customerName, phone, email, address, deliveryAddress: address, note,
    paymentMethod, paymentStatus: paymentMethod.toLowerCase().includes('cash') ? 'Pending' : 'Pending',
    items: selected.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
  const submitBtn = orderForm.querySelector('button[type="submit"]');
  orderSubmitting = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing order...'; }
  try {
    const response = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to place order.');

    // clear only ordered items
    mutateCart((next) => {
      const orderedIds = new Set(selected.map((i) => i.productId));
      next.items = getActiveItems(next).filter((i) => !orderedIds.has(i.productId));
    });

    const purchaseHistory = getPurchaseHistory();
    purchaseHistory.unshift({
      orderId: result.orderId,
      customerName, phone, email, address,
      paymentMethod, paymentStatus: result.order?.payment_status || 'Pending', status: result.order?.status || 'pending',
      total: result.order?.total ?? totals.total,
      subtotal: result.order?.subtotal ?? totals.subtotal,
      discount: 0,
      items: (result.order?.items && result.order.items.length ? result.order.items : selected).map((i) => ({
        productId: i.productId || i.id, name: i.name, image: i.image || '', price: i.price, quantity: i.quantity,
      })),
      purchasedAt: result.order?.created_at || new Date().toISOString(),
    });
    savePurchaseHistory(purchaseHistory.slice(0, 20));
    saveCustomer({ customerName, phone, email, address, note, paymentMethod });

    orderForm.reset();
    if (savedCustomerPrefill) savedCustomerPrefill();
    renderCart(); renderUserPanel(); renderUserPage();
    showToast(result.duplicate ? 'Order already received.' : `Order #${result.orderId} placed successfully.`);
    closeCart();
  } catch (error) {
    alert(error.message || 'Something went wrong. Your cart was not cleared.');
  } finally {
    orderSubmitting = false;
    syncCheckoutState(loadCartState());
  }
});




const PRODUCT_CATEGORIES = [
  { slug: 'all-products', label: 'All Products' },
  { slug: 'crunchy-snacks', label: 'Crunchy Snacks' },
  { slug: 'namkeen-mixtures', label: 'Namkeen & Mixtures' },
  { slug: 'bhujia-sev', label: 'Bhujia & Sev' },
  { slug: 'peanut-snacks', label: 'Peanut Snacks' },
  { slug: 'dal-pulse-snacks', label: 'Dal & Pulse Snacks' },
  { slug: 'spicy-masala-snacks', label: 'Spicy & Masala Snacks' },
];
const CATEGORY_SET = new Set(PRODUCT_CATEGORIES.map((c) => c.slug));
const getCategoryLabel = (slug) => (PRODUCT_CATEGORIES.find((c) => c.slug === slug) || { label: slug ? String(slug).replace(/-/g,' ') : 'Category' }).label;
const normalizeCategorySlug = (raw) => {
  const s = String(raw || 'all-products').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const map = { all:'all-products', savory:'namkeen-mixtures', nuts:'peanut-snacks', 'best-seller':'crunchy-snacks' };
  const mapped = map[s] || s;
  return CATEGORY_SET.has(mapped) ? mapped : 'all-products';
};
let activeCategory = normalizeCategorySlug(new URLSearchParams(location.search).get('category') || 'all-products');
let shopSearch = '';
let shopSort = 'featured';

const getCategoryCounts = () => {
  const counts = { 'all-products': catalogProducts.length };
  PRODUCT_CATEGORIES.forEach((c) => { if (c.slug !== 'all-products') counts[c.slug] = 0; });
  catalogProducts.forEach((p) => { const c = normalizeCategorySlug(p.category); counts[c] = (counts[c] || 0) + 1; });
  return counts;
};

const updateCategoryUI = () => {
  const counts = getCategoryCounts();
  document.querySelectorAll('[data-category-count]').forEach((el) => {
    const slug = el.dataset.categoryCount;
    const n = counts[slug] || 0;
    el.textContent = slug === 'all-products' ? `${n} products` : `${n} ${n === 1 ? 'product' : 'products'}`;
  });
  document.querySelectorAll('[data-category-link]').forEach((el) => el.classList.toggle('active', normalizeCategorySlug(el.dataset.categoryLink) === activeCategory));
  document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => btn.classList.toggle('active', normalizeCategorySlug(btn.dataset.filter) === activeCategory));
  const heading = document.getElementById('products-heading');
  const sub = document.getElementById('products-subheading');
  const countEl = document.getElementById('product-count');
  const clearBtn = document.getElementById('clear-category-filter');
  if (heading) heading.textContent = getCategoryLabel(activeCategory);
  if (sub) sub.textContent = activeCategory === 'all-products' ? 'Browse our complete collection of Namkeen & snacks.' : `Showing products in ${getCategoryLabel(activeCategory)}.`;
  if (clearBtn) clearBtn.hidden = activeCategory === 'all-products';
  if (countEl) countEl.textContent = `${getFilteredProducts().length} product${getFilteredProducts().length === 1 ? '' : 's'}`;
};

const getFilteredProducts = () => {
  const q = shopSearch.trim().toLowerCase();
  let items = catalogProducts.filter((p) => {
    const cat = normalizeCategorySlug(p.category);
    if (activeCategory !== 'all-products' && cat !== activeCategory) return false;
    if (q) {
      const hay = `${p.name || ''} ${p.description || ''} ${getCategoryLabel(cat)} ${cat}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (shopSort === 'name') items.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  else if (shopSort === 'price-asc') items.sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  else if (shopSort === 'price-desc') items.sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  return items;
};

const renderShopProducts = () => {
  const grid = document.getElementById('products-grid') || productGrid;
  const empty = document.getElementById('products-empty');
  if (!grid) return;
  const items = getFilteredProducts();
  if (!items.length) {
    grid.innerHTML = '';
    if (empty) { empty.hidden = false; empty.textContent = activeCategory === 'all-products' ? 'No products available.' : `No products found in ${getCategoryLabel(activeCategory)}.`; }
    updateCategoryUI();
    return;
  }
  if (empty) empty.hidden = true;
  grid.innerHTML = items.map((product) => {
    const cat = normalizeCategorySlug(product.category);
    return `
      <article class="product-card" data-category="${escapeHtml(cat)}" data-name="${escapeHtml(product.name || '')}" data-price="${Number(product.price||0)}" data-id="${escapeHtml(product.id)}">
        <div class="product-image"><img src="${escapeHtml(product.image || 'https://via.placeholder.com/400x300?text=Product')}" alt="${escapeHtml(product.name || 'Product')}" loading="lazy" /></div>
        <div class="product-body">
          <span class="pill">${escapeHtml(getCategoryLabel(cat))}</span>
          <h3>${escapeHtml(product.name || 'Product')}</h3>
          <p>${escapeHtml(product.description || 'Premium snack with rich Nepali flavor.')}</p>
          <div class="product-meta"><strong>${formatCurrency(product.price)}</strong><button class="add-cart" type="button" data-product-id="${escapeHtml(product.id)}">Add to cart</button></div>
        </div>
      </article>`;
  }).join('');
  updateCategoryUI();
};

const setActiveCategory = (slug, opts = {}) => {
  activeCategory = normalizeCategorySlug(slug);
  if (opts.syncUrl !== false && (currentPage === 'products' || opts.forceProducts)) {
    const url = new URL(location.href);
    url.pathname = '/products';
    if (activeCategory === 'all-products') url.searchParams.delete('category'); else url.searchParams.set('category', activeCategory);
    history.replaceState({}, '', url);
  }
  renderShopProducts();
  updateCategoryUI();
};


const renderPriceList = () => {
  const container = priceListContainer;
  if (!container) return;
  const rows = catalogProducts.length
    ? catalogProducts.map((product) => ({ id: String(product.id), name: product.name || 'Product', category: product.category || 'general', price: Number(product.price || 0), image: product.image||'', description: product.description||'' }))
    : [];
  const sorted = [...rows].sort((a, b) => (priceSortDirection === 'desc' ? b.price - a.price : a.price - b.price));
  if (!sorted.length) { container.innerHTML = '<p class="empty-state">No products available.</p>'; return; }
  container.innerHTML = sorted.map((item) => `
    <div class="price-item">
      <div><h3>${escapeHtml(item.name)}</h3><small>${escapeHtml(getCategoryLabel(item.category))}</small></div>
      <span class="price-number">${formatCurrency(item.price)}</span>
      <button class="price-buy" type="button" data-product-id="${escapeHtml(item.id)}">Add</button>
    </div>
  `).join('');
  container.querySelectorAll('.price-buy').forEach((button) => {
    button.addEventListener('click', () => {
      const product = sorted.find((x)=>String(x.id)===String(button.dataset.productId));
      if (product) addToCart({ ...product, productId: product.id }, button);
    });
  });
};

priceSortButton?.addEventListener('click', () => {
  priceSortDirection = priceSortDirection === 'desc' ? 'asc' : 'desc';
  priceSortButton.textContent = `Sort: ${priceSortDirection === 'desc' ? 'High to low' : 'Low to high'}`;
  renderPriceList();
});


function attachFilterHandlers() { updateCategoryUI(); }

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load products.');
    catalogProducts = Array.isArray(result.products) ? result.products : [];
    const renderGrid = (grid, limit) => {
      if (!grid) return;
      const items = typeof limit === 'number' ? catalogProducts.slice(0, limit) : catalogProducts;
      grid.innerHTML = items.map((product) => {
        const cat = normalizeCategorySlug(product.category);
        return `
      <article class="product-card" data-category="${escapeHtml(cat)}" data-name="${escapeHtml(product.name || '')}" data-price="${Number(product.price||0)}" data-id="${escapeHtml(product.id)}">
        <div class="product-image"><img src="${escapeHtml(product.image || 'https://via.placeholder.com/400x300?text=Product')}" alt="${escapeHtml(product.name || 'Product')}" loading="lazy" /></div>
        <div class="product-body">
          <span class="pill">${escapeHtml(getCategoryLabel(cat))}</span>
          <h3>${escapeHtml(product.name || 'Product')}</h3>
          <p>${escapeHtml(product.description || 'Premium snack with rich Nepali flavor.')}</p>
          <div class="product-meta"><strong>${formatCurrency(product.price)}</strong><button class="add-cart" type="button" data-product-id="${escapeHtml(product.id)}">Add to cart</button></div>
        </div>
      </article>`;
      }).join('');
    };
    renderGrid(document.getElementById('home-product-grid'));
    renderGrid(document.getElementById('home-featured-grid'), 4);
    renderShopProducts();
    updateCategoryUI();
    renderPriceList();
  } catch (error) { console.error(error); }
}

const navigateToCategory = (slug) => {
  const cat = normalizeCategorySlug(slug);
  if (currentPage !== 'products') {
    const url = new URL(location.origin + '/products');
    if (cat !== 'all-products') url.searchParams.set('category', cat);
    location.href = url.pathname + url.search;
    return;
  }
  activeCategory = cat;
  setActiveCategory(cat, { syncUrl: true });
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  const catLink = target.closest('[data-category-link]');
  if (catLink) { event.preventDefault(); navigateToCategory(catLink.dataset.categoryLink); return; }
  const filterBtn = target.closest('.filter-btn[data-filter]');
  if (filterBtn) { event.preventDefault(); setActiveCategory(filterBtn.dataset.filter, { syncUrl: true }); return; }
  if (target.id === 'clear-category-filter') { setActiveCategory('all-products', { syncUrl: true }); return; }
  const addCartBtn = target.closest('.add-cart');
  if (!addCartBtn) return;
  const card = addCartBtn.closest('.product-card');
  if (!card) return;
  const pid = String(addCartBtn.dataset.productId || card.dataset.id || '').trim();
  const fromCatalog = catalogProducts.find((p) => String(p.id) === pid) || catalogProducts.find((p) => p.name === card.dataset.name);
  const product = fromCatalog || { id: pid, name: card.dataset.name, price: Number(card.dataset.price), image: card.querySelector('img')?.getAttribute('src') || '', description: card.querySelector('p')?.textContent || '' };
  addToCart({ ...product, productId: String(product.id || pid) }, addCartBtn);
});


renderCart();
updateCartBadge();
renderPriceList();
const ps=document.getElementById('product-search');
ps?.addEventListener('input', (e)=>{ shopSearch = e.target.value || ''; renderShopProducts(); updateCategoryUI(); });
document.getElementById('product-sort')?.addEventListener('change', (e)=>{ shopSort = e.target.value || 'featured'; renderShopProducts(); });
document.querySelector('.search-wrap input[type="search"]')?.addEventListener('keydown', (e)=>{
  if (e.key !== 'Enter') return;
  const q = String(e.currentTarget.value || '').trim();
  if (currentPage === 'products') { shopSearch = q; if (ps) ps.value = q; renderShopProducts(); updateCategoryUI(); return; }
  const url = new URL(location.origin + '/products');
  if (q) url.searchParams.set('q', q);
  location.href = url.pathname + url.search;
});
if (new URLSearchParams(location.search).get('q')) { shopSearch = new URLSearchParams(location.search).get('q') || ''; if (ps) ps.value = shopSearch; }
loadProducts();

const savedCustomerPrefill = () => {
  const savedCustomer = getStoredCustomer();
  if (savedCustomer && orderForm) {
    if (savedCustomer.customerName) orderForm.customerName.value = savedCustomer.customerName;
    if (savedCustomer.phone) orderForm.phone.value = savedCustomer.phone;
    if (savedCustomer.email) orderForm.email.value = savedCustomer.email;
    const addr = savedCustomer.address || savedCustomer.deliveryAddress || '';
    if (addr) orderForm.address.value = addr;
    if (savedCustomer.note) orderForm.note.value = savedCustomer.note;
    const pm = orderForm.querySelector('[name="paymentMethod"]');
    if (pm && savedCustomer.paymentMethod) pm.value = savedCustomer.paymentMethod;
  }
};
savedCustomerPrefill();

const showToast = (message) => {
  let toast = document.getElementById('maha-toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'maha-toast'; document.body.appendChild(toast); }
  toast.textContent = String(message || '');
  toast.className = 'maha-toast show';
  setTimeout(() => { toast.className = 'maha-toast'; }, 2200);
};


async function refreshPurchaseHistoryStatus() {
  const history = getPurchaseHistory();
  const ids = history.map((h) => h.orderId).filter(Boolean).map(String);
  const phone = history.find((h) => h.phone)?.phone;
  if (!ids.length || !phone) return;
  try {
    const r = await fetch(`/api/orders/status?ids=${encodeURIComponent(ids.join(','))}&phone=${encodeURIComponent(phone)}`);
    const res = await r.json();
    if (!r.ok || !res.success || !Array.isArray(res.orders)) return;
    const byId = new Map(res.orders.map((o) => [String(o.id), o]));
    let changed = false;
    history.forEach((h) => {
      const o = byId.get(String(h.orderId));
      if (o && (h.status !== o.status || h.paymentStatus !== o.payment_status)) {
        h.status = o.status; h.paymentStatus = o.payment_status; h.total = o.total ?? h.total; changed = true;
      }
    });
    if (changed) { savePurchaseHistory(history); renderUserPanel(); renderUserPage(); }
  } catch {}
}
