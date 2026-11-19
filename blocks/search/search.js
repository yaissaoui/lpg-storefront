import { getSiteContext } from '../../scripts/site-config.js';
import { search, getMode } from '../../scripts/commerce/index.js';
import {
  el, productCard, errorMessage, fixtureNotice, loadProductCardStyles,
} from '../../scripts/product-ui.js';
import t from '../../scripts/i18n.js';

/**
 * Search results page. Reads ?q= and ?page=, renders a form and the product grid.
 * @param {Element} block The search block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext();
  const params = new URLSearchParams(window.location.search);
  const term = (params.get('q') || '').trim();
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const cssLoaded = loadProductCardStyles();

  const inputId = 'search-page-input';
  const form = el(
    'form',
    { class: 'search-form', role: 'search', action: window.location.pathname },
    el('label', { for: inputId, class: 'sr-only' }, t(ctx.lang, 'search')),
    el('input', {
      id: inputId, type: 'search', name: 'q', value: term, placeholder: t(ctx.lang, 'searchPlaceholder'),
    }),
    el('button', { type: 'submit', class: 'button primary' }, t(ctx.lang, 'search')),
  );
  const notice = fixtureNotice(ctx, await getMode());
  block.replaceChildren(...[notice, form].filter(Boolean));
  if (!term) return;

  let result;
  try {
    result = await search(term, { page });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('search', e);
    block.append(errorMessage(ctx));
    return;
  }
  await cssLoaded;
  block.append(el('p', { class: 'search-count', role: 'status' }, t(ctx.lang, 'results', result.page.totalCount)));
  if (!result.items.length) {
    block.append(errorMessage(ctx, 'noResults'));
    return;
  }
  block.append(el('ul', { class: 'product-list-grid' }, result.items.map((p) => productCard(p, ctx))));
  if (result.page.totalPages > 1) {
    const nav = el('nav', { class: 'search-pagination', 'aria-label': 'Pagination' });
    for (let i = 1; i <= result.page.totalPages; i += 1) {
      const p = new URLSearchParams(params);
      p.set('page', i);
      nav.append(i === page ? el('span', { 'aria-current': 'page' }, String(i)) : el('a', { href: `?${p}` }, String(i)));
    }
    block.append(nav);
  }
}
