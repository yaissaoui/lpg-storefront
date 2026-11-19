import { readBlockConfig } from '../../scripts/aem.js';
import { getSiteContext } from '../../scripts/site-config.js';
import { getProduct, cart, getMode } from '../../scripts/commerce/index.js';
import {
  el, sanitizeHtml, htmlToText, priceElement, productImage, errorMessage, fixtureNotice,
} from '../../scripts/product-ui.js';
import t from '../../scripts/i18n.js';

/** url_key: block config first, then the last path segment (/{prefix}/products/{url_key}). */
export function urlKeyFrom(config, pathname) {
  if (config['url-key']) return config['url-key'];
  const last = pathname.split('/').filter(Boolean).pop() || '';
  return decodeURIComponent(last.replace(/\.html$/, ''));
}

function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, name);
    document.head.append(meta);
  }
  meta.setAttribute('content', content);
}

function breadcrumbs(product, ctx) {
  const list = el('ol', {}, el('li', {}, el('a', { href: ctx.url('/') }, ctx.site.label)));
  product.breadcrumbs.forEach((b) => list.append(el('li', {}, el('a', { href: ctx.url(`/${b.urlPath}`) }, b.name))));
  list.append(el('li', { 'aria-current': 'page' }, product.name));
  return el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumb' }, list);
}

function gallery(product) {
  const images = product.images.length ? product.images : [null];
  const main = el('div', { class: 'pdp-gallery-main' }, productImage(images[0], { eager: true, width: 600, height: 600 }));
  const wrap = el('div', { class: 'pdp-gallery' });
  if (images.length > 1) {
    const thumbs = el('ul', { class: 'pdp-gallery-thumbs' });
    images.forEach((img, i) => {
      const button = el('button', { type: 'button', 'aria-label': img.label || `${product.name} ${i + 1}`, 'aria-current': i === 0 ? 'true' : null }, productImage(img, { width: 80, height: 80 }));
      button.addEventListener('click', () => {
        main.replaceChildren(productImage(img, { eager: true, width: 600, height: 600 }));
        thumbs.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
        button.setAttribute('aria-current', 'true');
      });
      thumbs.append(el('li', {}, button));
    });
    wrap.append(thumbs);
  }
  wrap.append(main);
  return wrap;
}

function optionPickers(product, selection, readOnly) {
  return product.options.map((option) => {
    const group = el('fieldset', { class: 'pdp-option' }, el('legend', {}, option.label));
    option.values.forEach((value) => {
      const id = `opt-${option.id}-${value.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
      const input = el('input', {
        type: 'radio', name: option.id, id, value: value.id, disabled: readOnly,
      });
      input.addEventListener('change', () => selection.set(option.id, value.id));
      group.append(input, el('label', { for: id }, value.label));
    });
    return group;
  });
}

function buyBox(product, ctx, selection) {
  const status = el('p', { class: 'pdp-status', role: 'status', 'aria-live': 'polite' });
  const qtyId = 'pdp-qty';
  const qty = el('input', {
    id: qtyId, type: 'number', min: '1', max: '99', value: '1', inputmode: 'numeric',
  });
  const button = el('button', { type: 'button', class: 'button primary pdp-add', disabled: !product.inStock }, t(ctx.lang, product.inStock ? 'addToCart' : 'outOfStock'));
  button.addEventListener('click', async () => {
    const missing = product.options.find((o) => !selection.has(o.id));
    if (missing) {
      status.textContent = `${missing.label} ?`;
      return;
    }
    button.disabled = true;
    button.textContent = t(ctx.lang, 'adding');
    try {
      const quantity = parseInt(qty.value, 10) || 1;
      await cart.add(product.sku, quantity, { selectedOptions: [...selection.values()] });
      status.textContent = t(ctx.lang, 'added');
    } catch (e) {
      status.textContent = e.message;
    } finally {
      button.disabled = false;
      button.textContent = t(ctx.lang, 'addToCart');
    }
  });
  return el(
    'div',
    { class: 'pdp-buy' },
    el('div', { class: 'pdp-qty' }, el('label', { for: qtyId }, t(ctx.lang, 'quantity')), qty),
    button,
    status,
  );
}

function showcaseActions(ctx) {
  const actions = el('div', { class: 'pdp-showcase' });
  if (ctx.site.storeLocatorPath) {
    actions.append(el('a', { class: 'button primary', href: ctx.url(ctx.site.storeLocatorPath) }, t(ctx.lang, 'whereToFind')));
  }
  const pro = ctx.locales.find((l) => l.professional && l.lang === ctx.lang);
  if (pro) {
    actions.append(el('p', { class: 'pdp-pro-link' }, el('a', { href: ctx.localeUrl(pro) }, t(ctx.lang, 'proShop'))));
  }
  return actions;
}

function tabs(product, ctx) {
  const codes = ctx.productAttributes;
  const defs = [
    ['description', 'tabDescription', product.description],
    ['application', 'tabApplication', product.attributes[codes.application]],
    ['ingredients', 'tabIngredients', product.attributes[codes.ingredients]],
    ['results', 'tabResults', product.attributes[codes.results]],
  ].filter(([, , html]) => html && htmlToText(html));
  if (!defs.length) return null;

  const list = el('div', { class: 'pdp-tablist', role: 'tablist' });
  const panels = el('div', { class: 'pdp-panels' });
  const buttons = [];
  const select = (index) => {
    buttons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
      panels.children[i].hidden = i !== index;
    });
  };
  defs.forEach(([id, label, html], i) => {
    const button = el('button', {
      type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': `panel-${id}`,
    }, t(ctx.lang, label));
    button.addEventListener('click', () => select(i));
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + defs.length) % defs.length;
      select(next);
      buttons[next].focus();
    });
    buttons.push(button);
    list.append(button);
    panels.append(el(
      'section',
      {
        role: 'tabpanel', id: `panel-${id}`, 'aria-labelledby': `tab-${id}`, tabindex: '0',
      },
      el('h2', {}, t(ctx.lang, label)),
      el('div', { class: 'pdp-panel-body' }, sanitizeHtml(html)),
    ));
  });
  select(0);
  return el('div', { class: 'pdp-tabs' }, list, panels);
}

/**
 * Product details (PDP).
 * Block config (optional): url-key. Otherwise the last path segment is the url_key.
 * Price and add to cart only when the current site and view sells (sites.json).
 * @param {Element} block The product-details block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext();
  const urlKey = urlKeyFrom(readBlockConfig(block), window.location.pathname);
  block.replaceChildren(el('p', { class: 'pdp-loading', 'aria-busy': 'true' }, '…'));

  let product;
  try {
    product = await getProduct(urlKey);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('product-details', e);
    block.replaceChildren(errorMessage(ctx));
    return;
  }
  if (!product) {
    block.replaceChildren(errorMessage(ctx, 'notFound'));
    return;
  }

  document.title = product.metaTitle;
  setMeta('description', product.metaDescription || htmlToText(product.shortDescription));
  setMeta('og:title', product.metaTitle, 'property');

  const selection = new Map();
  const info = el(
    'div',
    { class: 'pdp-info' },
    el('h1', { class: 'pdp-title' }, product.name),
    product.shortDescription ? el('div', { class: 'pdp-short' }, sanitizeHtml(product.shortDescription)) : null,
    ...optionPickers(product, selection, !ctx.sells),
    priceElement(product.price, ctx),
    ctx.sells ? buyBox(product, ctx, selection) : showcaseActions(ctx),
  );
  info.dataset.sku = product.sku;

  block.replaceChildren(...[
    fixtureNotice(ctx, await getMode()),
    breadcrumbs(product, ctx),
    el('div', { class: 'pdp-main' }, gallery(product), info),
    tabs(product, ctx),
  ].filter(Boolean));
}
