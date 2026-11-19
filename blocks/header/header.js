import { decorateIcons } from '../../scripts/aem.js';
import { getSiteContext } from '../../scripts/site-config.js';
import { getCategoryTree, cart } from '../../scripts/commerce/index.js';
import { el, formatMoney } from '../../scripts/product-ui.js';
import t from '../../scripts/i18n.js';

const isDesktop = window.matchMedia('(width >= 900px)');

function icon(name) {
  return el('span', { class: `icon icon-${name}` });
}

function navFromTree(tree, ctx) {
  return tree.map((node) => ({
    label: node.name,
    href: ctx.url(`/${node.urlPath}`),
    children: (node.children || []).map((c) => ({ label: c.name, href: ctx.url(`/${c.urlPath}`) })),
  }));
}

function staticNav(ctx) {
  const list = ctx.site.fallbackNav?.[ctx.lang] || ctx.site.fallbackNav?.en || [];
  return list.map((i) => ({ label: i.label, href: ctx.url(i.path), children: [] }));
}

async function loadNavItems(ctx) {
  try {
    const tree = await getCategoryTree();
    if (tree.length) return navFromTree(tree, ctx);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Category tree unavailable, static navigation used', e);
  }
  return staticNav(ctx);
}

function renderSections(items) {
  const ul = el('ul', { class: 'nav-sections-list' });
  items.forEach((item) => {
    const li = el('li', { class: 'nav-section' }, el('a', { href: item.href }, item.label));
    if (item.children.length) {
      li.classList.add('nav-drop');
      li.append(el('ul', { class: 'nav-sub' }, item.children.map((c) => el('li', {}, el('a', { href: c.href }, c.label)))));
    }
    ul.append(li);
  });
  return ul;
}

/**
 * "2 × 999,00 €": unit price including tax, or excluding tax on professional views.
 * Magento row_total and price are excluding tax, which is why both are read.
 */
function cartLine(item, ctx) {
  const unit = ctx.professional
    ? item.unitPrice
    : (item.unitPriceInclTax || item.unitPrice);
  const fmt = (m) => formatMoney(m, { ...ctx, priceSuffix: '' });
  if (!unit) return el('span', { class: 'nav-cart-line' }, fmt(item.rowTotalInclTax || item.rowTotal));
  return el('span', { class: 'nav-cart-line' }, `${item.quantity} × `, fmt(unit));
}

function renderMiniCart(ctx) {
  const count = el('span', { class: 'nav-cart-count', 'aria-live': 'polite' }, '0');
  const panel = el('div', {
    class: 'nav-cart-panel', id: 'nav-cart-panel', hidden: true, role: 'dialog', 'aria-label': t(ctx.lang, 'cart'),
  });
  const button = el(
    'button',
    {
      type: 'button', class: 'nav-cart-button', 'aria-controls': 'nav-cart-panel', 'aria-expanded': 'false',
    },
    icon('cart'),
    el('span', { class: 'sr-only' }, t(ctx.lang, 'cart')),
    count,
  );

  const render = (c) => {
    count.textContent = String(c.totalQuantity || 0);
    count.hidden = !c.totalQuantity;
    panel.replaceChildren();
    if (!c.items.length) {
      panel.append(el('p', {}, t(ctx.lang, 'cartEmpty')));
      return;
    }
    panel.append(el('ul', { class: 'nav-cart-items' }, c.items.map((i) => el(
      'li',
      {},
      el('a', { href: ctx.url(`/products/${encodeURIComponent(i.urlKey)}`) }, i.name),
      i.options.length ? el('span', { class: 'nav-cart-options' }, i.options.map((o) => `${o.label}: ${o.value}`).join(', ')) : null,
      cartLine(i, ctx),
    ))));
    panel.append(el('p', { class: 'nav-cart-total' }, `${t(ctx.lang, 'cartTotal')} `, el('strong', {}, formatMoney(c.grandTotal, ctx))));
  };

  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
  window.addEventListener('commerce:cart', (e) => render(e.detail));
  cart.get().then(render).catch(() => render({ totalQuantity: 0, items: [] }));
  return el('div', { class: 'nav-cart' }, button, panel);
}

/**
 * Header: logo, category navigation, search, account link, mini cart on selling views.
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext();
  const { logo } = ctx.site;
  const { lang } = ctx;

  const brand = el(
    'div',
    { class: 'nav-brand' },
    el(
      'a',
      { href: ctx.url('/'), 'aria-label': `${ctx.site.label}, ${t(lang, 'home')}` },
      el('img', {
        src: logo.src, alt: ctx.site.label, width: logo.width, height: logo.height, class: logo.invertOnLight ? 'logo-invert' : null,
      }),
    ),
  );

  const search = el(
    'form',
    { class: 'nav-search', role: 'search', action: ctx.url('/search') },
    el('label', { class: 'sr-only', for: 'nav-search-input' }, t(lang, 'search')),
    el('input', {
      id: 'nav-search-input', type: 'search', name: 'q', placeholder: t(lang, 'searchPlaceholder'), autocomplete: 'off',
    }),
    el('button', { type: 'submit', 'aria-label': t(lang, 'search') }, icon('search')),
  );

  const tools = el('div', { class: 'nav-tools' });
  tools.append(el(
    'a',
    { class: 'button primary nav-account', href: ctx.url(ctx.site.accountPath || '/') },
    icon('account'),
    el('span', {}, t(lang, ctx.siteKey === 'lpg' ? 'proAccount' : 'account')),
  ));
  if (ctx.miniCart) tools.append(renderMiniCart(ctx));

  const hamburger = el(
    'button',
    {
      type: 'button', class: 'nav-hamburger', 'aria-controls': 'nav-sections', 'aria-expanded': 'false', 'aria-label': t(lang, 'menu'),
    },
    el('span', { class: 'nav-hamburger-icon' }),
  );
  tools.append(hamburger);

  const sections = el('div', { class: 'nav-sections', id: 'nav-sections' });
  const nav = el('nav', { id: 'nav', 'aria-label': 'Main' }, brand, search, tools, sections);
  nav.setAttribute('aria-expanded', 'false');

  hamburger.addEventListener('click', () => {
    const open = nav.getAttribute('aria-expanded') === 'true';
    nav.setAttribute('aria-expanded', String(!open));
    hamburger.setAttribute('aria-expanded', String(!open));
    hamburger.setAttribute('aria-label', t(lang, open ? 'menu' : 'close'));
    document.body.style.overflowY = !open && !isDesktop.matches ? 'hidden' : '';
  });
  isDesktop.addEventListener('change', () => {
    nav.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflowY = '';
  });

  block.replaceChildren(el('div', { class: 'nav-wrapper' }, nav));
  decorateIcons(block);

  sections.append(renderSections(await loadNavItems(ctx)));
}
