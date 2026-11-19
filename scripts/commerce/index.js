/*
 * Data access module. The only place that talks to Commerce.
 * Blocks import the bound functions at the bottom of this file and never call GraphQL.
 * Contract and shapes: scripts/commerce/README.md.
 */

import { createHttpTransport, CommerceError } from './client.js';
import { createFixtureTransport } from './fixtures.js';
import {
  PRODUCT_BY_URL_KEY, CATEGORY_BY_URL_PATH, PRODUCTS_BY_CATEGORY, PRODUCT_SEARCH,
  CATEGORY_TREE, CREATE_GUEST_CART, ADD_PRODUCTS_TO_CART, GET_CART, SORTS,
} from './queries.js';
import {
  normaliseProduct, normaliseCategory, normaliseProductPage, normaliseCategoryTree,
  normaliseCart, emptyCart,
} from './normalise.js';
import { getSiteContext } from '../site-config.js';

export { CommerceError };
export const SORT_KEYS = Object.keys(SORTS);

const DEFAULT_PAGE_SIZE = 12;
const isMissingCart = (errors = []) => errors.some((e) => /could not find a cart|cart.*(not active|isn't active)/i.test(e.message || ''));
const cleanPath = (p = '') => String(p).replace(/^\/+|\/+$/g, '');

/**
 * Creates an API bound to one store view. Pure: every dependency is injected.
 * @param {object} opts
 * @param {string} [opts.endpoint] GraphQL URL. Empty means FIXTURE mode.
 * @param {string} opts.store Commerce store view code (fr, pro_fr, wellbox_fr, ...)
 * @param {string} [opts.currency] currency used by fixtures
 * @param {Function} [opts.fetchImpl] fetch replacement for tests
 * @param {Storage} [opts.storage] localStorage-like object for the cart id
 * @param {Function} [opts.onCartChange] called with the normalised cart after each change
 * @param {Function} [opts.transport] full transport replacement for tests
 */
export function createCommerce({
  endpoint = '', store, currency = 'EUR', fetchImpl, storage, onCartChange, transport,
} = {}) {
  if (!store) throw new CommerceError('A store view code is required', 'CONFIG_ERROR');
  const mode = endpoint ? 'live' : 'fixture';
  const send = transport || (endpoint
    ? createHttpTransport({ endpoint, store, fetchImpl })
    : createFixtureTransport({ store, currency, storage }));
  const memory = new Map();
  const box = storage || {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  const cartKey = `commerce-cart:${store}`;

  async function run(op, variables = {}) {
    const json = await send({
      query: op.query, variables, operationName: op.name, method: op.method,
    });
    // Commerce answers 200 with { errors, data: { field: null } } for most failures.
    const empty = !json?.data || Object.values(json.data).every((v) => v == null);
    if (json?.errors?.length && empty) {
      throw new CommerceError(json.errors[0].message, 'GRAPHQL_ERROR', json.errors);
    }
    return { data: json?.data || {}, errors: json?.errors || [] };
  }

  async function getProduct(urlKey) {
    if (!urlKey) return null;
    const { data } = await run(PRODUCT_BY_URL_KEY, { urlKey });
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

  const notify = (cart) => {
    if (onCartChange) onCartChange(cart);
    return cart;
  };

  const cart = {
    id: () => box.getItem(cartKey),
    async create() {
      const { data } = await run(CREATE_GUEST_CART);
      const id = data.createGuestCart?.cart?.id;
      if (!id) throw new CommerceError('createGuestCart returned no id', 'CART_ERROR');
      box.setItem(cartKey, id);
      return id;
    },
    async get() {
      const id = box.getItem(cartKey);
      if (!id) return emptyCart();
      try {
        const { data } = await run(GET_CART, { cartId: id });
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
     * @param {object} [options] { selectedOptions: [uid, ...] }
     */
    async add(sku, qty = 1, options = {}) {
      const quantity = Number(qty);
      if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
        throw new CommerceError('sku and a positive quantity are required', 'INVALID_INPUT');
      }
      const item = { sku, quantity };
      if (options.selectedOptions?.length) item.selected_options = options.selectedOptions;
      const attempt = async (retry) => {
        const cartId = box.getItem(cartKey) || await cart.create();
        try {
          const { data } = await run(ADD_PRODUCTS_TO_CART, { cartId, items: [item] });
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
    mode, store, getProduct, listCategory, search, getCategoryTree, cart,
  };
}

/* Browser bindings: one instance per page, bound to the current site and locale. */

let instance;
function api() {
  if (!instance) {
    instance = getSiteContext().then((ctx) => {
      let storage;
      try {
        storage = window.localStorage;
      } catch (e) {
        storage = undefined;
      }
      return createCommerce({
        endpoint: ctx.endpoint,
        store: ctx.storeCode,
        currency: ctx.currency,
        storage,
        onCartChange: (c) => window.dispatchEvent(new CustomEvent('commerce:cart', { detail: c })),
      });
    });
  }
  return instance;
}

export const getMode = async () => (await api()).mode;
export const getProduct = async (urlKey) => (await api()).getProduct(urlKey);
export const listCategory = async (urlPath, opts) => (await api()).listCategory(urlPath, opts);
export const search = async (term, opts) => (await api()).search(term, opts);
export const getCategoryTree = async () => (await api()).getCategoryTree();
export const cart = {
  create: async () => (await api()).cart.create(),
  add: async (sku, qty, options) => (await api()).cart.add(sku, qty, options),
  get: async () => (await api()).cart.get(),
  clear: async () => (await api()).cart.clear(),
};
