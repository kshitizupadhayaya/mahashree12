const cartKey = 'maha-cart';

const header = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');
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
const productGrid = document.querySelector('.product-grid');

const loadCart = () => {
  try {
    return JSON.parse(localStorage.getItem(cartKey)) || [];
  } catch (error) {
    return [];
  }
};

const saveCart = (cart) => localStorage.setItem(cartKey, JSON.stringify(cart));

const formatCurrency = (value) => `NPR ${Number(value || 0).toFixed(0)}`;

const openCart = () => {
  cartPanel.classList.add('open');
  cartOverlay.classList.add('visible');
};

const closeCart = () => {
  cartPanel.classList.remove('open');
  cartOverlay.classList.remove('visible');
};

const renderCart = () => {
  const cart = loadCart();
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  subtotalElement.textContent = formatCurrency(subtotal);

  if (!cart.length) {
    cartItemsContainer.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map((item) => `
      <div class="cart-item" data-id="${item.id}">
        <div>
          <h4>${item.name}</h4>
          <div class="item-controls">
            <button class="qty-btn decrease" type="button" data-id="${item.id}">-</button>
            <span>${item.quantity}</span>
            <button class="qty-btn increase" type="button" data-id="${item.id}">+</button>
          </div>
        </div>
        <div>
          <div class="item-price">${formatCurrency(item.price * item.quantity)}</div>
          <button class="remove-item" type="button" data-id="${item.id}">Remove</button>
        </div>
      </div>
    `)
    .join('');
};

const addToCart = (product) => {
  const cart = loadCart();
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart(cart);
  renderCart();
  openCart();
};

const updateItemQuantity = (id, change) => {
  const cart = loadCart();
  const index = cart.findIndex((item) => item.id === id);

  if (index === -1) return;

  cart[index].quantity += change;

  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }

  saveCart(cart);
  renderCart();
};

const removeFromCart = (id) => {
  const cart = loadCart().filter((item) => item.id !== id);
  saveCart(cart);
  renderCart();
};

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('mobile-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

function attachFilterHandlers() {
  const productCards = document.querySelectorAll('.product-card');
  const currentFilterButtons = document.querySelectorAll('.filter-btn');

  currentFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;

      currentFilterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));

      productCards.forEach((card) => {
        const categories = card.dataset.category || '';
        const matches = filter === 'all' || categories.includes(filter);
        card.style.display = matches ? 'block' : 'none';
      });
    });
  });
}

async function loadProducts() {
  if (!productGrid) return;

  try {
    const response = await fetch('/api/products');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Unable to load products.');
    }

    const products = result.products || [];
    productGrid.innerHTML = products.map((product) => `
      <article class="product-card" data-category="${product.category}" data-name="${product.name}" data-price="${product.price}">
        <div class="product-image">
          <img src="${product.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80'}" alt="${product.name}" />
        </div>
        <div class="product-body">
          <span class="pill">${product.category === 'best-seller' ? 'Best seller' : product.category || 'Fresh'}</span>
          <h3>${product.name}</h3>
          <p>${product.description || 'Premium snack mix with rich Nepali flavor.'}</p>
          <div class="product-meta">
            <strong>${formatCurrency(product.price)}</strong>
            <button class="add-cart" type="button">Add to cart</button>
          </div>
        </div>
      </article>
    `).join('');

    attachFilterHandlers();
    document.querySelectorAll('.add-cart').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.closest('.product-card');
        const product = {
          id: `${card.dataset.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          name: card.dataset.name,
          price: Number(card.dataset.price),
        };

        addToCart(product);
      });
    });
  } catch (error) {
    console.error(error);
  }
}

let testimonialIndex = 0;

function showTestimonial(index) {
  testimonials.forEach((item, idx) => {
    item.classList.toggle('active', idx === index);
  });
}

if (testimonials.length) {
  prevButton?.addEventListener('click', () => {
    testimonialIndex = (testimonialIndex - 1 + testimonials.length) % testimonials.length;
    showTestimonial(testimonialIndex);
  });

  nextButton?.addEventListener('click', () => {
    testimonialIndex = (testimonialIndex + 1) % testimonials.length;
    showTestimonial(testimonialIndex);
  });

  setInterval(() => {
    testimonialIndex = (testimonialIndex + 1) % testimonials.length;
    showTestimonial(testimonialIndex);
  }, 5000);
}

document.querySelectorAll('.cart-trigger').forEach((button) => {
  button.addEventListener('click', openCart);
});

document.querySelector('.close-cart')?.addEventListener('click', closeCart);
cartOverlay?.addEventListener('click', closeCart);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCart();
});

cartItemsContainer?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const id = target.dataset.id;

  if (target.classList.contains('increase')) {
    updateItemQuantity(id, 1);
  }

  if (target.classList.contains('decrease')) {
    updateItemQuantity(id, -1);
  }

  if (target.classList.contains('remove-item')) {
    removeFromCart(id);
  }
});

orderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const cart = loadCart();
  if (!cart.length) {
    alert('Please add at least one product before placing the order.');
    return;
  }

  const formData = new FormData(orderForm);
  const payload = {
    customerName: formData.get('customerName')?.toString().trim(),
    phone: formData.get('phone')?.toString().trim(),
    email: formData.get('email')?.toString().trim(),
    address: formData.get('address')?.toString().trim(),
    note: formData.get('note')?.toString().trim(),
    items: cart,
    total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Unable to place order.');
    }

    localStorage.removeItem(cartKey);
    renderCart();
    orderForm.reset();
    alert('Order placed successfully! Our team will contact you soon.');
    closeCart();
  } catch (error) {
    alert(error.message || 'Something went wrong.');
  }
});

renderCart();
loadProducts();
