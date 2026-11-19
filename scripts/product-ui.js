/*
 * Shared rendering helpers for product blocks. No data access here: blocks get data from
 * scripts/commerce/ and pass normalised objects in.
 */
import { loadCSS } from './aem.js';
import t from './i18n.js';

/** Shared card and grid styles, only fetched by blocks that render product cards. */
export function loadProductCardStyles() {
  return loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-card.css`);
}

/** Small element factory. Children can be strings or nodes. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return node;
}

/**
 * Commerce HTML (descriptions, attributes) is admin authored. Keep formatting tags,
 * drop scripts, frames, event handlers and javascript: links.
 */
export function sanitizeHtml(html = '') {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') n.removeAttribute(a.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
  const fragment = document.createDocumentFragment();
  fragment.append(...doc.body.firstElementChild.childNodes);
  return fragment;
}

export function htmlToText(html = '') {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
}

export function formatMoney(money, ctx) {
  if (!money) return '';
  const formatted = new Intl.NumberFormat(ctx.numberLocale, {
    style: 'currency', currency: money.currency || ctx.currency,
  }).format(money.value);
  return ctx.priceSuffix ? `${formatted} ${ctx.priceSuffix}` : formatted;
}

/** Price element, or null when the current site or view does not sell. */
export function priceElement(price, ctx) {
  if (!ctx.sells || !price) return null;
  return el(
    'p',
    { class: 'product-price' },
    price.discounted ? el('del', { class: 'product-price-regular' }, formatMoney(price.regular, ctx)) : null,
    el('span', { class: 'product-price-final' }, formatMoney(price.final, ctx)),
  );
}

export function productUrl(product, ctx) {
  return ctx.url(`/products/${encodeURIComponent(product.urlKey)}`);
}

export function productImage(image, { eager = false, width = 400, height = 400 } = {}) {
  if (!image) return el('div', { class: 'product-image-placeholder', 'aria-hidden': 'true' });
  return el('img', {
    src: image.url,
    alt: image.label || '',
    width,
    height,
    loading: eager ? 'eager' : 'lazy',
    fetchpriority: eager ? 'high' : null,
    decoding: 'async',
  });
}

/** Product card used by product-list and search. */
export function productCard(product, ctx, { eager = false } = {}) {
  const href = productUrl(product, ctx);
  const card = el(
    'li',
    { class: 'product-card' },
    el('a', { class: 'product-card-image', href, tabindex: '-1' }, productImage(product.image, { eager })),
    el('h2', { class: 'product-card-name' }, el('a', { href }, product.name)),
  );
  if (product.shortDescription) {
    card.append(el('div', { class: 'product-card-summary' }, sanitizeHtml(product.shortDescription)));
  }
  const price = priceElement(product.price, ctx);
  if (price) card.append(price);
  if (ctx.sells && !product.inStock) card.append(el('p', { class: 'product-card-stock' }, t(ctx.lang, 'outOfStock')));
  card.append(el('a', { class: 'product-card-more', href }, el('span', {}, t(ctx.lang, 'learnMore'))));
  return card;
}

export function errorMessage(ctx, key = 'error') {
  return el('p', { class: 'commerce-message', role: 'status' }, t(ctx.lang, key));
}

/** Visible marker on dev hosts so nobody mistakes fixtures for the sandbox. */
export function fixtureNotice(ctx, mode) {
  if (mode !== 'fixture' || !ctx.dev) return null;
  return el('p', { class: 'commerce-fixture-notice' }, t(ctx.lang, 'fixtureNotice'));
}
