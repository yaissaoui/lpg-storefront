/*
 * Data access module. The only place that talks to Commerce.
 * Blocks import the bound functions at the bottom of this file and never call GraphQL.
 * Contract and shapes: scripts/commerce/README.md.
 *
 * Two clients, the same split as the Adobe commerce boilerplate:
 * - catalogue client: products, categories, search. Backend "aco" (Commerce Optimizer
 *   Merchandising GraphQL on commerce-endpoint), "paas-core" (PaaS core GraphQL) or "fixture".
 * - core client: cart, account, checkout, price book id. Always the PaaS core GraphQL on
 *   commerce-core-endpoint, with the Store header.
 */

import { createHttpTransport, createRunner, CommerceError } from './client.js';
import { createFixtureTransport } from './fixtures.js';
import {
  PRODUCT_BY_URL_KEY, PRODUCT_BY_SKU, CATEGORY_BY_URL_PATH, PRODUCTS_BY_CATEGORY, PRODUCT_SEARCH,
  CATEGORY_TREE, CREATE_GUEST_CART, ADD_PRODUCTS_TO_CART, GET_CART, SORTS,
} from './queries.js';
import {
  normaliseProduct, normaliseCategory, normaliseProductPage, normaliseCategoryTree,
  normaliseCart, emptyCart,
} from './normalise.js';
import { createAcoCatalog } from './aco.js';
import { isMagentoOptionUid } from './aco-normalise.js';
import { createPriceBookResolver } from './price-book.js';
import { getSiteContext } from '../site-config.js';

export { CommerceError };
export const SORT_KEYS = Object.keys(SORTS);
export const BACKENDS = ['aco', 'paas-core', 'fixture'];

const DEFAULT_PAGE_SIZE = 12;
const isMissingCart = (errors = []) => errors.some((e) => /could not find a cart|cart.*(not active|isn't active)/i.test(e.message || ''));
const cleanPath = (p = '') => String(p).replace(/^\/+|\/+$/g, '');

function memoryStorage() {
  const memory = new Map();
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
}

/** Catalogue functions on the PaaS core GraphQL (or the fixture transport). */
function createPaasCatalog(run) {
  async function getProduct(urlKey, { sku } = {}) {
    if (!urlKey && !sku) return null;
    const { data } = urlKey
      ? await run(PRODUCT_BY_URL_KEY, { urlKey })
      : await run(PRODUCT_BY_SKU, { sku });
    return normaliseProduct(data.products?.items?.[0]);
  }

  async function listCategory(urlPath, { page = 1, pageSize = DEFAULT_PAGE_SIZE, sort = 'position' } = {}) {
    const { data } = await run(CATEGORY_BY_URL_PATH, { urlPath: cleanPath(urlPath) });
    const category = normaliseCategory(data.categories?.items?.[0]);
    if (!category) return null;
    const sortKey = SORTS[sort] ? sort : 'position';
    const products = await run(PRODUCTS_BY_CATEGORY, {
      uid: category.id, pageSize, currentPage: page, sort: SORTS[sortKey],
    });
    return {
      category,
      sort: sortKey,
      ...normaliseProductPage(products.data.products, { page, pageSize }),
    };
  }

  async function search(term, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    const q = String(term || '').trim();
    if (!q) return { term: '', ...normaliseProductPage(null, { page, pageSize }) };
    const { data } = await run(PRODUCT_SEARCH, { search: q, pageSize, currentPage: page });
    return { term: q, ...normaliseProductPage(data.products, { page, pageSize }) };
  }

  async function getCategoryTree() {
    const { data } = await run(CATEGORY_TREE);
    return normaliseCategoryTree(data.categoryList);
  }

  // PaaS accepts the parent sku with selected_options, no lookup needed.
  const resolveVariant = async () => null;

  return {
    getProduct, listCategory, search, getCategoryTree, resolveVariant,
  };
}

/**
 * Builds the CartItemInput for addProductsToCart on PaaS.
 * - Simple product: { sku, quantity }.
 * - Configurable product: parent sku plus selected_options, when the option ids are Magento
 *   uids (true for PaaS and for ACO filled by the connector, checked live on 19 Nov 2026).
 * - Otherwise, when a variant sku is known: { sku: variant, parent_sku: parent }.
 */
export function buildCartItem(sku, quantity, { selectedOptions = [], variantSku = null } = {}) {
  const item = { sku, quantity };
  if (!selectedOptions.length) return item;
  if (selectedOptions.every(isMagentoOptionUid) || !variantSku) {
    item.selected_options = selectedOptions;
    return item;
  }
  return { sku: variantSku, parent_sku: sku, quantity };
}

/**
 * Creates an API bound to one store view. Pure: every dependency is injected.
 * @param {object} opts
 * @param {string} [opts.backend] aco | paas-core | fixture. Default: paas-core when an
 *   endpoint is set, fixture otherwise (the behaviour before ACO).
 * @param {string} [opts.endpoint] catalogue GraphQL URL (ACO URL when backend is aco)
 * @param {string} [opts.coreEndpoint] PaaS core GraphQL URL. Defaults to endpoint for paas-core.
 * @param {string} opts.store Commerce store view code (fr, pro_fr, wellbox_fr, ...)
 * @param {object} [opts.aco] { viewId, priceBookId, locale, policies, method, navFamily }
 * @param {boolean} [opts.sells] false: no price book lookup, the base price book is used
 * @param {string} [opts.currency] currency used by fixtures
 * @param {Function} [opts.fetchImpl] fetch replacement for tests
 * @param {Storage} [opts.storage] localStorage-like object for the cart id
 * @param {Storage} [opts.sessionStorage] sessionStorage-like object for the price book id
 * @param {Function} [opts.onCartChange] called with the normalised cart after each change
 * @param {Function} [opts.transport] transport replacement for tests (catalogue and core)
 * @param {Function} [opts.coreTransport] core transport replacement for tests
 */
export function createCommerce({
  backend, endpoint = '', coreEndpoint = '', store, aco = {}, sells = true, currency = 'EUR',
  fetchImpl, storage, sessionStorage, onCartChange, transport, coreTransport,
} = {}) {
  if (!store) throw new CommerceError('A store view code is required', 'CONFIG_ERROR');
  let kind = backend || (endpoint || transport ? 'paas-core' : 'fixture');
  if (!BACKENDS.includes(kind)) throw new CommerceError(`Unknown catalog backend "${kind}"`, 'CONFIG_ERROR');
  if (kind !== 'fixture' && !endpoint && !transport) kind = 'fixture';
  const mode = kind === 'fixture' ? 'fixture' : 'live';

  const fixture = kind === 'fixture' ? createFixtureTransport({ store, currency, storage }) : null;
  const coreUrl = coreEndpoint || (kind === 'paas-core' ? endpoint : '');

  let coreSend = coreTransport || transport || fixture;
  if (!coreSend && coreUrl) coreSend = createHttpTransport({ endpoint: coreUrl, store, fetchImpl });
  if (!coreSend) {
    coreSend = async () => {
      throw new CommerceError('commerce-core-endpoint is not configured', 'CONFIG_ERROR');
    };
  }
  const runCore = createRunner(coreSend);

  let catalog;
  let priceBook = null;
  if (kind === 'aco') {
    // No Store header on ACO: it is a PaaS header and would only widen the CORS preflight.
    const acoSend = transport || createHttpTransport({ endpoint, fetchImpl });
    priceBook = createPriceBookResolver({
      runCore: coreUrl || coreTransport ? runCore : null,
      store,
      baseId: aco.priceBookId || '',
      enabled: sells,
      storage: sessionStorage || memoryStorage(),
    });
    catalog = createAcoCatalog({ run: createRunner(acoSend), aco, priceBook });
  } else if (kind === 'fixture') {
    catalog = createPaasCatalog(runCore);
  } else {
    catalog = createPaasCatalog(createRunner(transport
      || createHttpTransport({ endpoint, store, fetchImpl })));
  }

  const box = storage || memoryStorage();
  const cartKey = `commerce-cart:${store}`;

  const notify = (cart) => {
    if (onCartChange) onCartChange(cart);
    return cart;
  };

  const cart = {
    id: () => box.getItem(cartKey),
    async create() {
      const { data } = await runCore(CREATE_GUEST_CART);
      const id = data.createGuestCart?.cart?.id;
      if (!id) throw new CommerceError('createGuestCart returned no id', 'CART_ERROR');
      box.setItem(cartKey, id);
      return id;
    },
    async get() {
      const id = box.getItem(cartKey);
      if (!id) return emptyCart();
      try {
        const { data } = await runCore(GET_CART, { cartId: id });
        return normaliseCart(data.cart) || emptyCart();
      } catch (e) {
        if (e instanceof CommerceError && isMissingCart(e.details)) {
          box.removeItem(cartKey);
          return emptyCart();
        }
        throw e;
      }
    },
    /**
     * @param {string} sku product sku (the parent sku for a configurable product)
     * @param {number} qty quantity, integer above 0
     * @param {object} [options] { selectedOptions: [option value id, ...] }
     */
    async add(sku, qty = 1, options = {}) {
      const quantity = Number(qty);
      if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
        throw new CommerceError('sku and a positive quantity are required', 'INVALID_INPUT');
      }
      const selectedOptions = options.selectedOptions || [];
      let variantSku = options.variantSku || null;
      if (!variantSku && selectedOptions.length && !selectedOptions.every(isMagentoOptionUid)) {
        variantSku = await catalog.resolveVariant(sku, selectedOptions);
      }
      const item = buildCartItem(sku, quantity, { selectedOptions, variantSku });
      const attempt = async (retry) => {
        const cartId = box.getItem(cartKey) || await cart.create();
        try {
          const { data } = await runCore(ADD_PRODUCTS_TO_CART, { cartId, items: [item] });
          const result = data.addProductsToCart;
          if (result?.user_errors?.length) {
            const [first] = result.user_errors;
            throw new CommerceError(first.message, first.code || 'USER_ERROR', result.user_errors);
          }
          return notify(normaliseCart(result?.cart));
        } catch (e) {
          if (retry && e instanceof CommerceError && isMissingCart(e.details)) {
            box.removeItem(cartKey);
            return attempt(false);
          }
          throw e;
        }
      };
      return attempt(true);
    },
    clear() {
      box.removeItem(cartKey);
      notify(emptyCart());
    },
  };

  return {
    mode,
    backend: kind,
    store,
    getProduct: catalog.getProduct,
    listCategory: catalog.listCategory,
    search: catalog.search,
    getCategoryTree: catalog.getCategoryTree,
    /** Price book id sent to ACO (null on other backends). */
    getPriceBookId: async () => (priceBook ? priceBook.get() : null),
    /** Forget the cached price book id, for example after sign in or sign out. */
    resetPriceBook: () => priceBook?.reset(),
    cart,
  };
}

/* Browser bindings: one instance per page, bound to the current site and locale. */

function safe(name) {
  try {
    return window[name];
  } catch (e) {
    return undefined;
  }
}

let instance;
function api() {
  if (!instance) {
    instance = getSiteContext().then((ctx) => createCommerce({
      backend: ctx.catalogBackend,
      endpoint: ctx.endpoint,
      coreEndpoint: ctx.coreEndpoint,
      store: ctx.storeCode,
      aco: ctx.aco,
      sells: ctx.sells,
      currency: ctx.currency,
      storage: safe('localStorage'),
      sessionStorage: safe('sessionStorage'),
      onCartChange: (c) => window.dispatchEvent(new CustomEvent('commerce:cart', { detail: c })),
    }));
  }
  return instance;
}

export const getMode = async () => (await api()).mode;
export const getBackend = async () => (await api()).backend;
export const getProduct = async (urlKey, opts) => (await api()).getProduct(urlKey, opts);
export const listCategory = async (urlPath, opts) => (await api()).listCategory(urlPath, opts);
export const search = async (term, opts) => (await api()).search(term, opts);
export const getCategoryTree = async () => (await api()).getCategoryTree();
export const resetPriceBook = async () => (await api()).resetPriceBook();
export const cart = {
  create: async () => (await api()).cart.create(),
  add: async (sku, qty, options) => (await api()).cart.add(sku, qty, options),
  get: async () => (await api()).cart.get(),
  clear: async () => (await api()).cart.clear(),
};
