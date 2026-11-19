import { readBlockConfig } from '../../scripts/aem.js';
import { getSiteContext } from '../../scripts/site-config.js';
import { listCategory, getMode, SORT_KEYS } from '../../scripts/commerce/index.js';
import {
  el, productCard, errorMessage, fixtureNotice, sanitizeHtml, loadProductCardStyles,
} from '../../scripts/product-ui.js';
import t from '../../scripts/i18n.js';

const SORT_LABELS = {
  position: 'sortPosition', name: 'sortName', price_asc: 'sortPriceAsc', price_desc: 'sortPriceDesc',
};

function pageHref(params, page) {
  const p = new URLSearchParams(params);
  if (page > 1) p.set('page', page);
  else p.delete('page');
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

function breadcrumbs(category, ctx) {
  const list = el('ol', {}, el('li', {}, el('a', { href: ctx.url('/') }, ctx.site.label)));
  category.breadcrumbs.forEach((b) => list.append(el('li', {}, el('a', { href: ctx.url(`/${b.urlPath}`) }, b.name))));
  list.append(el('li', { 'aria-current': 'page' }, category.name));
  return el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumb' }, list);
}

function sortControl(ctx, current, params) {
  const id = 'product-list-sort';
  const keys = SORT_KEYS.filter((k) => ctx.sells || !k.startsWith('price'));
  const select = el('select', { id }, keys.map((k) => el('option', { value: k, selected: k === current }, t(ctx.lang, SORT_LABELS[k] || k))));
  select.addEventListener('change', () => {
    const p = new URLSearchParams(params);
    p.set('sort', select.value);
    p.delete('page');
    window.location.href = `${window.location.pathname}?${p}`;
  });
  return el('div', { class: 'product-list-sort' }, el('label', { for: id }, t(ctx.lang, 'sortBy')), select);
}

function pagination(ctx, page, params) {
  if (page.totalPages <= 1) return null;
  const items = [];
  if (page.current > 1) items.push(el('li', {}, el('a', { href: pageHref(params, page.current - 1), rel: 'prev' }, t(ctx.lang, 'previous'))));
  for (let i = 1; i <= page.totalPages; i += 1) {
    items.push(el('li', {}, i === page.current
      ? el('span', { 'aria-current': 'page' }, String(i))
      : el('a', { href: pageHref(params, i), 'aria-label': `${t(ctx.lang, 'page')} ${i}` }, String(i))));
  }
  if (page.current < page.totalPages) items.push(el('li', {}, el('a', { href: pageHref(params, page.current + 1), rel: 'next' }, t(ctx.lang, 'next'))));
  return el('nav', { class: 'product-list-pagination', 'aria-label': 'Pagination' }, el('ul', {}, items));
}

/**
 * Product list (PLP). Block config (optional): category = Commerce url_path, page-size = number.
 * Variant compact: product row only, for related products on other pages.
 * Without a category the url_path is the page path after the locale prefix.
 * Production PLPs come from BYOM or JSON2HTML (see README).
 * This block also renders them client side.
 * @param {Element} block The product-list block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext();
  const config = readBlockConfig(block);
  const urlPath = (config.category || ctx.relativePath).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(window.location.search);
  const compact = block.classList.contains('compact');
  const page = compact ? 1 : Math.max(1, parseInt(params.get('page'), 10) || 1);
  const pageSize = Math.min(48, Math.max(1, parseInt(config['page-size'], 10) || 12));
  const sort = (!compact && params.get('sort')) || 'position';

  block.replaceChildren(el('p', { class: 'product-list-loading', 'aria-busy': 'true' }, '…'));
  const cssLoaded = loadProductCardStyles();

  let result;
  try {
    result = await listCategory(urlPath, { page, pageSize, sort });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('product-list', e);
    block.replaceChildren(errorMessage(ctx));
    return;
  }
  if (!result) {
    block.replaceChildren(errorMessage(ctx, 'categoryNotFound'));
    return;
  }

  const { category } = result;
  const grid = el('ul', { class: 'product-list-grid' }, result.items.map((p, i) => productCard(p, ctx, { eager: !compact && i < 4 })));

  // Variant "compact": a row of products inside another page (PDP, home). No title, no controls.
  if (compact) {
    await cssLoaded;
    block.replaceChildren(grid);
    return;
  }

  if (category.metaTitle) document.title = category.metaTitle;

  const head = el(
    'div',
    { class: 'product-list-head' },
    breadcrumbs(category, ctx),
    el('h1', {}, category.name),
  );
  if (category.description) head.append(el('div', { class: 'product-list-description' }, sanitizeHtml(category.description)));

  const toolbar = el(
    'div',
    { class: 'product-list-toolbar' },
    el('p', { class: 'product-list-count' }, t(ctx.lang, 'results', result.page.totalCount)),
    sortControl(ctx, result.sort, params),
  );

  await cssLoaded;
  const notice = fixtureNotice(ctx, await getMode());
  const pager = pagination(ctx, result.page, params);
  block.replaceChildren(...[notice, head, toolbar, grid, pager].filter(Boolean));
}
