/*
 * Product list and search results on the storefront-product-discovery drop-in, after
 * blocks/product-list-page of aem-boilerplate-commerce (April 2026 suite state), without wishlist.
 * Used by blocks/product-list (category pages, variant "compact" for related products)
 * and blocks/search (search page, ?q=).
 *
 * Views that do not sell (LPG fr, en) get no price and no add to cart: the ProductPrice
 * slot is emptied and the ProductActions slot holds a link to the product page.
 */
import SearchResults from '@dropins/storefront-product-discovery/containers/SearchResults.js';
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import SortBy from '@dropins/storefront-product-discovery/containers/SortBy.js';
import Pagination from '@dropins/storefront-product-discovery/containers/Pagination.js';
import { render as provider } from '@dropins/storefront-product-discovery/render.js';
import { search } from '@dropins/storefront-product-discovery/api.js';
import { Button, Icon, provider as UI } from '@dropins/tools/components.js';
import { events } from '@dropins/tools/event-bus.js';
import { loadCSS } from './aem.js';
import { fetchPlaceholders, getProductLink } from './commerce.js';
import { getSiteContext } from './site-config.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';
import './initializers/search.js';

const VISIBILITY = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };

function format(template = '', values = {}) {
  return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), template);
}

function productLink(product, text, className) {
  const a = document.createElement('a');
  a.href = getProductLink(product.urlKey, product.sku);
  a.className = className;
  a.textContent = text;
  return a;
}

/**
 * @param {Element} block
 * @param {object} options
 * @param {string} [options.category] categoryPath (Magento url_path). Empty: search mode.
 * @param {number} [options.pageSize]
 * @param {boolean} [options.compact] product row only, no facets, sort, pagination or URL sync
 */
export default async function renderProductDiscovery(block, {
  category = '', pageSize = 12, compact = false,
} = {}) {
  const [labels, ctx] = await Promise.all([
    fetchPlaceholders(),
    getSiteContext(),
    loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-discovery.css`),
  ]);
  block.classList.add('product-discovery');
  block.classList.toggle('product-discovery--showcase', !ctx.sells);
  block.classList.toggle('product-discovery--compact', compact);

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__wrapper">
      <div class="search__result-info" role="status" aria-live="polite"></div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__product-sort"></div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>
  `);
  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');
  block.replaceChildren(fragment);

  const state = compact
    ? {
      phrase: '', currentPage: 1, sort: [], filter: [],
    }
    : getSearchStateFromUrl(new URL(window.location.href));
  const userFilters = state.filter.filter((f) => f.attribute !== 'visibility');

  if (!compact) {
    const normalized = new URL(window.location.href);
    applySearchStateToUrl(normalized, state);
    window.history.replaceState({}, '', normalized.toString());
  }

  const request = category
    ? {
      phrase: '',
      currentPage: state.currentPage,
      pageSize,
      sort: state.sort?.length ? state.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [{ attribute: 'categoryPath', eq: category }, VISIBILITY, ...userFilters],
    }
    : {
      phrase: state.phrase,
      currentPage: state.currentPage,
      pageSize,
      sort: state.sort,
      filter: [VISIBILITY, ...userFilters],
    };

  // A search page without a term lists nothing, like the previous block.
  if (category || state.phrase) {
    await search(request).catch((e) => console.error('product discovery: search failed', e));
  }

  const addToCartLabel = labels.Global?.AddProductToCart || 'Add to cart';
  const viewLabel = labels.Global?.ViewProduct || 'View';

  const productActions = (ctx2) => {
    const { product } = ctx2;
    const wrapper = document.createElement('div');
    wrapper.className = 'product-discovery-product-actions';
    // Showcase views and configurable products: go to the product page.
    if (!ctx.sells || product.typename === 'ComplexProductView') {
      wrapper.append(productLink(product, ctx.sells ? addToCartLabel : viewLabel, 'button secondary'));
    } else {
      const button = document.createElement('div');
      UI.render(Button, {
        'aria-label': `${addToCartLabel} ${product.name || product.sku}`,
        children: addToCartLabel,
        icon: Icon({ source: 'Cart' }),
        variant: 'primary',
        onClick: async () => {
          const cartApi = await import('@dropins/storefront-cart/api.js');
          await cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]);
        },
      })(button);
      wrapper.append(button);
    }
    ctx2.replaceWith(wrapper);
  };

  const slots = {
    ProductActions: productActions,
    ...(ctx.sells ? {} : { ProductPrice: (c) => c.replaceWith(document.createElement('span')) }),
  };

  const containers = [
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
      skeletonCount: compact ? Math.min(pageSize, 4) : pageSize,
      slots,
    })($productList),
  ];
  if (!compact) {
    containers.push(
      provider.render(SortBy, {})($productSort),
      provider.render(Pagination, {
        onPageChange: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      })($pagination),
      UI.render(Button, {
        children: labels.Global?.Filters || 'Filters',
        icon: Icon({ source: 'Burger' }),
        variant: 'secondary',
        onClick: () => $facets.classList.toggle('search__facets--visible'),
      })($viewFacets),
      provider.render(Facets, {})($facets),
    );
  }
  await Promise.all(containers);

  if (compact) return;

  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;
    block.classList.toggle('product-discovery--empty', totalCount === 0);
    $resultInfo.textContent = payload.request?.phrase
      ? format(labels.Global?.ResultsFor, { count: totalCount, phrase: payload.request.phrase })
      : format(labels.Global?.Results, { count: totalCount });
    const facetsButton = $viewFacets.querySelector('button');
    const userFilterCount = (payload.request?.filter || [])
      .filter((f) => !['visibility', 'categoryPath'].includes(f.attribute)).length;
    if (userFilterCount) facetsButton?.setAttribute('data-count', userFilterCount);
    else facetsButton?.removeAttribute('data-count');
  }, { eager: true });

  // URL is owned by this project; update it when the search state changes.
  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });
}
