/*
 * Catalogue client for Adobe Commerce Optimizer (Merchandising GraphQL).
 * Used when catalog-backend is "aco". Cart, account and checkout never come here, they stay
 * on the PaaS core GraphQL (index.js).
 */

import { CommerceError } from './client.js';
import {
  ACO_PRODUCTS_BY_SKU, ACO_PRODUCT_BY_URL_KEY, ACO_CATEGORIES, ACO_PRODUCTS_BY_CATEGORY,
  ACO_SEARCH, ACO_NAVIGATION, ACO_REFINE_PRODUCT, ACO_PRICES_BY_SKU, ACO_SORTS,
} from './aco-queries.js';
import {
  normaliseAcoProduct, normaliseAcoCategory, normaliseAcoSearchPage, normaliseAcoNavigation,
  acoMissingPrice,
} from './aco-normalise.js';

/** A view id that is empty or still a TODO placeholder from config/sites.json. */
export const isPlaceholder = (v) => !v || /^TODO/i.test(String(v));

/**
 * Headers of the Merchandising API.
 * @param {object} aco { viewId, priceBookId, locale, policies: { Name: value } }
 */
export function buildAcoHeaders({
  viewId, priceBookId, locale, policies,
} = {}) {
  if (isPlaceholder(viewId)) {
    throw new CommerceError('ACO catalog view id is not configured (aco.viewId in config/sites.json)', 'CONFIG_ERROR');
  }
  const headers = { 'AC-View-ID': viewId };
  if (priceBookId) headers['AC-Price-Book-ID'] = priceBookId;
  // Not in the public header list. The sandbox names AC-Scope-Locale in its errors when no
  // view resolves the locale. Only sent when aco.locale is set.
  if (locale) headers['AC-Scope-Locale'] = locale;
  Object.entries(policies || {}).forEach(([name, value]) => {
    if (name && value != null && value !== '') headers[`AC-Policy-${name}`] = String(value);
  });
  return headers;
}

const cleanPath = (p = '') => String(p).replace(/^\/+|\/+$/g, '');

/** "a/b/c" -> ["a", "a/b", "a/b/c"] */
export function slugChain(slug) {
  const parts = cleanPath(slug).split('/').filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/**
 * @param {object} opts
 * @param {Function} opts.run runner bound to the ACO endpoint (client.createRunner)
 * @param {object} opts.aco { viewId, priceBookId (base), locale, policies, method, navFamily }
 * @param {object} opts.priceBook resolver from price-book.js
 */
export function createAcoCatalog({ run, aco = {}, priceBook }) {
  const navFamily = aco.navFamily || 'top_menu';
  const method = aco.method || undefined;
  const headersFor = (priceBookId) => buildAcoHeaders({ ...aco, priceBookId });
  const withBook = (priceBookId) => ({ headers: headersFor(priceBookId), method });
  const unpriced = () => withBook(priceBook.baseId);

  /**
   * Runs a priced query. The guest child price book (website::sha1(0)) holds only the
   * entries that differ for the group, so SKUs without a price there are re-read from the
   * base price book (observed on the sandbox on 19 Nov 2026).
   */
  async function priced(op, variables, pick) {
    const book = await priceBook.get();
    const { data } = await run(op, variables, withBook(book));
    const views = (pick(data) || []).filter(Boolean);
    const base = priceBook.baseId;
    const missing = views.filter(acoMissingPrice).map((v) => v.sku).filter(Boolean);
    if (base && book && book !== base && missing.length) {
      try {
        const res = await run(ACO_PRICES_BY_SKU, { skus: missing }, withBook(base));
        const bySku = new Map((res.data.products || []).filter(Boolean).map((p) => [p.sku, p]));
        views.forEach((v) => {
          const b = bySku.get(v.sku);
          if (!b || !acoMissingPrice(v)) return;
          if (b.price !== undefined) v.price = b.price;
          if (b.priceRange !== undefined) v.priceRange = b.priceRange;
        });
      } catch (e) { /* prices stay empty, the page still renders */ }
    }
    return data;
  }

  /**
   * @param {string} urlKey product url key (slug)
   * @param {object} [opts] { sku } skips the search when the sku is known
   */
  async function getProduct(urlKey, { sku } = {}) {
    if (sku) {
      const data = await priced(ACO_PRODUCTS_BY_SKU, { skus: [sku] }, (d) => d.products);
      return normaliseAcoProduct((data.products || []).find((p) => p?.sku === sku));
    }
    if (!urlKey) return null;
    const data = await priced(
      ACO_PRODUCT_BY_URL_KEY,
      { urlKey },
      (d) => (d.productSearch?.items || []).map((i) => i?.productView),
    );
    const view = (data.productSearch?.items || []).map((i) => i?.productView)
      .find((p) => p && p.urlKey === urlKey);
    return normaliseAcoProduct(view);
  }

  async function listCategory(urlPath, { page = 1, pageSize = 12, sort = 'position' } = {}) {
    const slug = cleanPath(urlPath);
    if (!slug) return null;
    const { data } = await run(ACO_CATEGORIES, { slugs: slugChain(slug) }, unpriced());
    const category = normaliseAcoCategory(data.categoryTree, slug);
    if (!category) return null;
    const sortKey = ACO_SORTS[sort] ? sort : 'position';
    const products = await priced(
      ACO_PRODUCTS_BY_CATEGORY,
      {
        slug, pageSize, currentPage: page, sort: ACO_SORTS[sortKey],
      },
      (d) => (d.productSearch?.items || []).map((i) => i?.productView),
    );
    const result = normaliseAcoSearchPage(products.productSearch, { page, pageSize });
    return { category, sort: sortKey, ...result };
  }

  async function search(term, { page = 1, pageSize = 12 } = {}) {
    const q = String(term || '').trim();
    if (!q) return { term: '', ...normaliseAcoSearchPage(null, { page, pageSize }) };
    const data = await priced(
      ACO_SEARCH,
      { phrase: q, pageSize, currentPage: page },
      (d) => (d.productSearch?.items || []).map((i) => i?.productView),
    );
    return { term: q, ...normaliseAcoSearchPage(data.productSearch, { page, pageSize }) };
  }

  async function getCategoryTree() {
    const { data } = await run(ACO_NAVIGATION, { family: navFamily }, unpriced());
    return normaliseAcoNavigation(data.navigation);
  }

  /** Simple product sku behind a configurable selection, or null. */
  async function resolveVariant(sku, optionIds = []) {
    if (!sku || !optionIds.length) return null;
    const { data } = await run(ACO_REFINE_PRODUCT, { sku, optionIds }, unpriced());
    const v = data.refineProduct;
    // eslint-disable-next-line no-underscore-dangle
    return v?.sku && v.__typename === 'SimpleProductView' ? v.sku : null;
  }

  return {
    getProduct, listCategory, search, getCategoryTree, resolveVariant,
  };
}
