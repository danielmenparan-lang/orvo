const API = '';
const CART_KEY = 'mono_cart_v1';

const money = (n) => `₪${Number(n).toLocaleString('he-IL')}`;

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartCount();
  window.dispatchEvent(new CustomEvent('mono:cart'));
}

function addToCart(product, qty = 1) {
  const cart = getCart();
  const existing = cart.find((i) => i.id === product.id);
  if (existing) existing.qty = Math.min(10, existing.qty + qty);
  else {
    cart.push({
      id: product.id,
      slug: product.slug,
      name_he: product.name_he,
      price_ils: product.price_ils,
      image: product.image,
      qty,
    });
  }
  saveCart(cart);
  toast('נוסף לעגלה');
}

function removeFromCart(id) {
  saveCart(getCart().filter((i) => i.id !== id));
}

function setQty(id, qty) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, Math.min(10, qty));
  saveCart(cart);
}

function cartCount() {
  return getCart().reduce((s, i) => s + i.qty, 0);
}

function cartSubtotal() {
  return getCart().reduce((s, i) => s + i.price_ils * i.qty, 0);
}

function updateCartCount() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = String(cartCount());
  });
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: res.status });
  return data;
}

function renderCartDrawer() {
  const body = document.querySelector('[data-cart-body]');
  const subtotalEl = document.querySelector('[data-cart-subtotal]');
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = '<p style="color:var(--muted);padding:1rem 0">העגלה ריקה.</p>';
  } else {
    body.innerHTML = cart
      .map(
        (i) => `
      <div class="cart-line">
        <img src="${i.image}" alt="">
        <div>
          <strong>${i.name_he}</strong>
          <div style="color:var(--muted);font-size:.85rem;margin:.25rem 0">${money(i.price_ils)} × ${i.qty}</div>
          <button class="rm" data-rm="${i.id}">הסר</button>
        </div>
        <div>${money(i.price_ils * i.qty)}</div>
      </div>`
      )
      .join('');
    body.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => removeFromCart(btn.dataset.rm));
    });
  }
  if (subtotalEl) subtotalEl.textContent = money(cartSubtotal());
}

function openCart() {
  document.querySelector('.cart-drawer')?.classList.add('open');
  document.querySelector('.drawer-backdrop')?.classList.add('open');
  renderCartDrawer();
}

function closeCart() {
  document.querySelector('.cart-drawer')?.classList.remove('open');
  document.querySelector('.drawer-backdrop')?.classList.remove('open');
}

function mountShell() {
  updateCartCount();
  document.querySelectorAll('[data-open-cart]').forEach((el) => el.addEventListener('click', openCart));
  document.querySelectorAll('[data-close-cart]').forEach((el) => el.addEventListener('click', closeCart));
  window.addEventListener('mono:cart', renderCartDrawer);

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function productCard(p) {
  return `
  <article class="product-card reveal">
    <a class="media" href="/product/${p.slug}">
      ${p.badge_he ? `<span class="badge">${p.badge_he}</span>` : ''}
      <img src="${p.image}" alt="${p.name_he}" loading="lazy">
    </a>
    <div class="meta">
      <span class="cat">${p.category_he}</span>
      <h3><a href="/product/${p.slug}">${p.name_he}</a></h3>
      <p class="tagline">${p.tagline_he || ''}</p>
      <div class="price-row">
        <span class="price">${money(p.price_ils)}</span>
        ${p.compare_at_ils ? `<span class="compare">${money(p.compare_at_ils)}</span>` : ''}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost" data-add="${p.id}">לעגלה</button>
      <a class="btn" href="/product/${p.slug}">פרטים</a>
    </div>
  </article>`;
}

window.Mono = {
  api,
  money,
  getCart,
  saveCart,
  addToCart,
  removeFromCart,
  setQty,
  cartCount,
  cartSubtotal,
  updateCartCount,
  toast,
  openCart,
  closeCart,
  mountShell,
  productCard,
  renderCartDrawer,
};
