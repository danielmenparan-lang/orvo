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
  toast('נוסף לתיק — בחירה מצוינת');
  return cart;
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

function toast(msg, { social = false } = {}) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('social', !!social);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), social ? 3200 : 1800);
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

function shipNudgeHtml(subtotal, freeOver, shippingIls) {
  if (subtotal >= freeOver) {
    return `<div class="ship-nudge"><strong>זכית במשלוח מתנה</strong> — הזמנה מעל ₪${freeOver.toLocaleString('he-IL')}</div>`;
  }
  const left = freeOver - subtotal;
  return `<div class="ship-nudge">עוד <strong>${money(left)}</strong> למשלוח מתנה (במקום ₪${shippingIls})</div>`;
}

function renderCartDrawer(meta = window.__monoMeta || {}) {
  const body = document.querySelector('[data-cart-body]');
  const subtotalEl = document.querySelector('[data-cart-subtotal]');
  const nudge = document.querySelector('[data-ship-nudge]');
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = '<p style="color:var(--muted);padding:1rem 0">התיק ריק. בחרו פריט מהקולקציה.</p>';
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
  const sub = cartSubtotal();
  if (subtotalEl) subtotalEl.textContent = money(sub);
  if (nudge) {
    nudge.innerHTML = shipNudgeHtml(
      sub,
      Number(meta.free_shipping_over || 590),
      Number(meta.shipping_ils || 39)
    );
  }
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

function stars(rating) {
  const full = Math.round(Number(rating) || 5);
  return '★'.repeat(Math.min(5, full)) + '☆'.repeat(Math.max(0, 5 - full));
}

function scarcityLabel(p) {
  const left = Number(p.limited_left ?? p.stock ?? 0);
  if (left <= 5) return `נותרו רק ${left} יחידות במלאי`;
  if (left <= 12) return `${left} יחידות אחרונות בקולקציה`;
  return `${p.sold_month || 0}+ נרכשו החודש`;
}

function productCard(p) {
  const left = Number(p.limited_left ?? p.stock ?? 0);
  return `
  <article class="product-card reveal">
    <a class="media" href="/product/${p.slug}">
      ${p.badge_he ? `<span class="badge">${p.badge_he}</span>` : ''}
      <img src="${p.image}" alt="${p.name_he}" loading="lazy">
      <div class="scarcity-pill">${scarcityLabel(p)}</div>
    </a>
    <div class="meta">
      <span class="cat">${p.category_he}</span>
      <h3><a href="/product/${p.slug}">${p.name_he}</a></h3>
      <p class="tagline">${p.tagline_he || ''}</p>
      <div class="rating-row"><span class="stars">${stars(p.rating)}</span> ${p.rating} · ${p.reviews_count} ביקורות</div>
      <div class="price-row">
        <span class="price">${money(p.price_ils)}</span>
        ${p.compare_at_ils ? `<span class="compare">${money(p.compare_at_ils)}</span>` : ''}
        ${p.save_pct ? `<span class="save-tag">חיסכון ${p.save_pct}%</span>` : ''}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-gold" data-add="${p.id}">להוסיף לתיק</button>
      <a class="btn btn-ghost" href="/product/${p.slug}">לפרטים</a>
    </div>
  </article>`;
}

function startCountdown(iso, root) {
  if (!root || !iso) return;
  const tick = () => {
    const diff = Math.max(0, new Date(iso) - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    root.innerHTML = `
      <span>${String(d).padStart(2, '0')}י</span>
      <span>${String(h).padStart(2, '0')}ש</span>
      <span>${String(m).padStart(2, '0')}ד</span>
      <span>${String(s).padStart(2, '0')}שנ</span>`;
  };
  tick();
  clearInterval(startCountdown._t);
  startCountdown._t = setInterval(tick, 1000);
}

function startSocialProof(products, social) {
  if (!products?.length || !social) return;
  const cities = social.cities || ['תל אביב'];
  const verbs = social.verbs || ['רכש/ה'];
  const fire = () => {
    const p = products[Math.floor(Math.random() * products.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    const mins = 2 + Math.floor(Math.random() * 28);
    toast(`${verb} את ${p.name_he} ב${city} · לפני ${mins} דק׳`, { social: true });
  };
  clearInterval(startSocialProof._t);
  setTimeout(fire, 4500);
  startSocialProof._t = setInterval(fire, 14000);
}

function mountShell() {
  updateCartCount();
  document.querySelectorAll('[data-open-cart]').forEach((el) => el.addEventListener('click', openCart));
  document.querySelectorAll('[data-close-cart]').forEach((el) => el.addEventListener('click', closeCart));
  window.addEventListener('mono:cart', () => renderCartDrawer());

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function observeReveals(scope = document) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
    { threshold: 0.12 }
  );
  scope.querySelectorAll('.reveal').forEach((el) => io.observe(el));
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
  startCountdown,
  startSocialProof,
  observeReveals,
  stars,
  scarcityLabel,
  shipNudgeHtml,
};
