/*
 * Commerce Optimizer catalogue client, price book resolution and backend routing.
 * Payloads are fake and follow the Merchandising API schema (ProductView, CategoryTreeView).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommerce, buildCartItem, CommerceError } from '../scripts/commerce/index.js';
import { buildAcoHeaders, slugChain, isPlaceholder } from '../scripts/commerce/aco.js';
import {
  normaliseAcoProduct, normaliseAcoProductSummary, normaliseAcoCategory, normaliseAcoSearchPage,
  normaliseAcoNavigation, acoPrice, acoPriceWithTax, isMagentoOptionUid, acoProductType,
} from '../scripts/commerce/aco-normalise.js';
import { createPriceBookResolver, priceBookCacheKey } from '../scripts/commerce/price-book.js';

const ACO_URL = 'https://aco.example.com/TENANT/graphql';
const CORE_URL = 'https://paas.example.com/graphql';
const GUEST_BOOK = 'demo_site::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c';
const uid = (s) => Buffer.from(s).toString('base64');

const money = (value) => ({ amount: { value, currency: 'EUR' } });

const SIMPLE = {
  __typename: 'SimpleProductView',
  id: 'ID-SIMPLE',
  sku: 'DEMO-ACO-1',
  name: 'Demo cream',
  urlKey: 'demo-cream',
  shortDescription: '<p>short</p>',
  description: '<p>long</p>',
  metaTitle: '',
  metaDescription: 'Demo meta',
  images: [
    { url: 'https://cdn.example.com/a.jpg', label: 'A', roles: [] },
    { url: 'https://cdn.example.com/b.jpg', label: 'B', roles: ['image', 'small_image'] },
  ],
  attributes: [
    { name: 'application', label: 'Application', value: '<p>apply</p>' },
    { name: 'weight', label: 'Weight', value: 0.1 },
    { name: 'skin', label: 'Skin', value: ['Dry', 'Oily'] },
    { name: 'blob', label: 'Blob', value: { a: 1 } },
  ],
  categories: [
    {
      slug: 'care', name: 'Care', level: 1, parents: [],
    },
    {
      slug: 'care/face', name: 'Face', level: 2, parents: [{ slug: 'care', name: 'Care' }],
    },
  ],
  price: { regular: money(50), final: money(40), roles: ['visible'] },
};

const COMPLEX = {
  __typename: 'ComplexProductView',
  id: 'ID-COMPLEX',
  sku: 'DEMO-ACO-2',
  name: 'Demo device',
  urlKey: 'demo-device',
  images: [],
  options: [{
    id: 'color',
    title: 'Colour',
    required: true,
    values: [
      { id: uid('configurable/93/13'), title: 'White', inStock: false },
      { id: uid('configurable/93/14'), title: 'Nude', inStock: true },
    ],
  }],
  priceRange: {
    minimum: { regular: money(1000), final: money(800) },
    maximum: { regular: money(1100), final: money(1100) },
  },
};

/* Normalisation */

test('ACO simple product maps to the stable Product shape', () => {
  const p = normaliseAcoProduct(SIMPLE);
  assert.equal(p.type, 'simple');
  assert.equal(p.sku, 'DEMO-ACO-1');
  assert.equal(p.urlKey, 'demo-cream');
  assert.equal(p.inStock, true);
  assert.equal(p.metaTitle, 'Demo cream', 'falls back to the name');
  assert.deepEqual(p.image, { url: 'https://cdn.example.com/b.jpg', label: 'B' }, 'small_image role wins');
  assert.deepEqual(p.images.map((i) => i.label), ['A', 'B']);
  assert.deepEqual(p.price, { regular: { value: 50, currency: 'EUR' }, final: { value: 40, currency: 'EUR' }, discounted: true });
  assert.deepEqual(p.attributes, { application: '<p>apply</p>', weight: '0.1', skin: 'Dry, Oily' });
  assert.deepEqual(p.categories, [{ id: 'care', name: 'Care', urlPath: 'care' }, { id: 'care/face', name: 'Face', urlPath: 'care/face' }]);
  assert.deepEqual(p.breadcrumbs, [{ name: 'Care', urlPath: 'care' }, { name: 'Face', urlPath: 'care/face' }]);
  assert.deepEqual(p.options, []);
  assert.equal(normaliseAcoProduct(null), null);
});

test('ACO complex product: options, minimum price, stock from option values', () => {
  const p = normaliseAcoProduct(COMPLEX);
  assert.equal(p.type, 'configurable');
  assert.equal(p.price.final.value, 800);
  assert.equal(p.inStock, true);
  assert.equal(p.image, null);
  assert.deepEqual(p.images, []);
  assert.deepEqual(p.options, [{
    id: 'color',
    code: 'color',
    label: 'Colour',
    values: [{ id: uid('configurable/93/13'), label: 'White' }, { id: uid('configurable/93/14'), label: 'Nude' }],
  }]);
  const soldOut = {
    ...COMPLEX,
    options: [{
      ...COMPLEX.options[0],
      values: COMPLEX.options[0].values.map((v) => ({ ...v, inStock: false })),
    }],
  };
  assert.equal(normaliseAcoProductSummary(soldOut).inStock, false);
  assert.equal(acoProductType({ __typename: 'ComplexProductView', options: [] }), 'complex');
});

test('ACO price: missing, hidden or partial prices', () => {
  assert.equal(acoPrice(null), null);
  assert.equal(acoPrice({ regular: money(10), final: money(10), roles: ['hidden'] }), null);
  assert.deepEqual(acoPrice({ regular: money(10) }), { regular: { value: 10, currency: 'EUR' }, final: { value: 10, currency: 'EUR' }, discounted: false });
  assert.equal(normaliseAcoProductSummary({ ...SIMPLE, price: null }).price, null);
});

test('Magento option uid detection', () => {
  assert.equal(isMagentoOptionUid(uid('configurable/93/13')), true);
  assert.equal(isMagentoOptionUid(uid('bundle/1/2/1')), true);
  assert.equal(isMagentoOptionUid('color-white'), false);
  assert.equal(isMagentoOptionUid(''), false);
});

test('ACO category, search page and navigation shapes', () => {
  const nodes = [
    { slug: 'care', name: 'Care', level: 1 },
    {
      slug: 'care/face', name: 'Face', level: 2, description: '<p>d</p>', metaTags: { title: 'Face care', description: 'm' }, images: [{ url: 'https://cdn.example.com/c.jpg', label: '' }],
    },
  ];
  assert.deepEqual(normaliseAcoCategory(nodes, 'care/face'), {
    id: 'care/face',
    name: 'Face',
    urlPath: 'care/face',
    description: '<p>d</p>',
    image: { url: 'https://cdn.example.com/c.jpg', label: 'Face' },
    metaTitle: 'Face care',
    metaDescription: 'm',
    breadcrumbs: [{ name: 'Care', urlPath: 'care' }],
  });
  assert.equal(normaliseAcoCategory(nodes, 'nope'), null);
  assert.deepEqual(slugChain('/care/face/'), ['care', 'care/face']);

  const page = normaliseAcoSearchPage({
    total_count: 3,
    page_info: { current_page: 2, page_size: 2, total_pages: 2 },
    items: [{ productView: SIMPLE }, { productView: null }],
  });
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.page, {
    current: 2, size: 2, totalPages: 2, totalCount: 3,
  });

  const nav = normaliseAcoNavigation([
    { slug: 'care', name: 'Care', children: [{ slug: 'care/face', name: 'Face', children: [] }] },
    { slug: '', name: 'broken' },
  ]);
  assert.deepEqual(nav, [{
    id: 'care',
    name: 'Care',
    urlPath: 'care',
    position: 0,
    children: [{
      id: 'care/face', name: 'Face', urlPath: 'care/face', position: 0, children: [],
    }],
  }]);
});

/* Headers */

test('ACO headers: view id required, price book, policies, optional locale', () => {
  assert.deepEqual(buildAcoHeaders({ viewId: 'VIEW-1', priceBookId: 'demo_site' }), { 'AC-View-ID': 'VIEW-1', 'AC-Price-Book-ID': 'demo_site' });
  assert.deepEqual(
    buildAcoHeaders({
      viewId: 'VIEW-1', locale: 'demo_fr', policies: { Brand: 'Demo', Empty: '' },
    }),
    { 'AC-View-ID': 'VIEW-1', 'AC-Scope-Locale': 'demo_fr', 'AC-Policy-Brand': 'Demo' },
  );
  assert.throws(() => buildAcoHeaders({ viewId: 'TODO-fr-catalog-view-id' }), (e) => e.code === 'CONFIG_ERROR');
  assert.throws(() => buildAcoHeaders({}), (e) => e.code === 'CONFIG_ERROR');
  assert.equal(isPlaceholder('2f0e6a7c-0000-4000-8000-000000000000'), false);
});

/* Price book resolution */

function store() {
  const m = new Map();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

test('price book: core answer is cached per store, reset clears it', async () => {
  let calls = 0;
  const runCore = async () => {
    calls += 1;
    return { data: { commerceOptimizer: { priceBookId: GUEST_BOOK } } };
  };
  const storage = store();
  const r = createPriceBookResolver({
    runCore, store: 'demo_fr', baseId: 'demo_site', storage,
  });
  const [a, b] = await Promise.all([r.get(), r.get()]);
  assert.equal(a, GUEST_BOOK);
  assert.equal(b, GUEST_BOOK);
  assert.equal(await r.get(), GUEST_BOOK);
  assert.equal(calls, 1, 'one core call, concurrent callers share it');
  assert.equal(storage.getItem(priceBookCacheKey('demo_fr')), GUEST_BOOK);

  const again = createPriceBookResolver({
    runCore, store: 'demo_fr', baseId: 'demo_site', storage,
  });
  assert.equal(await again.get(), GUEST_BOOK);
  assert.equal(calls, 1, 'the next page reads the session cache');

  r.reset();
  assert.equal(storage.getItem(priceBookCacheKey('demo_fr')), null);
  assert.equal(await r.get(), GUEST_BOOK);
  assert.equal(calls, 2);
});

test('price book: falls back to the base book on error or empty answer, without caching', async () => {
  const storage = store();
  const failing = createPriceBookResolver({
    runCore: async () => { throw new CommerceError('down', 'NETWORK_ERROR'); }, store: 'demo_fr', baseId: 'demo_site', storage,
  });
  assert.equal(await failing.get(), 'demo_site');
  assert.equal(storage.getItem(priceBookCacheKey('demo_fr')), null);
  const empty = createPriceBookResolver({
    runCore: async () => ({ data: { commerceOptimizer: null } }), store: 'demo_fr', baseId: 'demo_site', storage,
  });
  assert.equal(await empty.get(), 'demo_site');
  let called = false;
  const off = createPriceBookResolver({
    runCore: async () => { called = true; return {}; }, store: 'demo_fr', baseId: 'demo_site', enabled: false,
  });
  assert.equal(await off.get(), 'demo_site');
  assert.equal(called, false, 'views without prices skip the core call');
});

/* Routing: catalogue to ACO, cart and price book to PaaS */

function fakeBackends({ acoData = {}, failCore = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    const op = init.method === 'GET' ? u.searchParams.get('operationName') : JSON.parse(init.body).operationName;
    const variables = init.method === 'GET'
      ? JSON.parse(u.searchParams.get('variables') || '{}') : JSON.parse(init.body).variables;
    calls.push({
      host: u.host, op, method: init.method, headers: init.headers, variables,
    });
    let body;
    if (u.origin + u.pathname === ACO_URL) {
      const handler = acoData[op];
      body = { data: handler ? handler(variables, init.headers) : {} };
    } else if (failCore) {
      throw new Error('CORS');
    } else if (op === 'CommerceOptimizerPriceBook') {
      body = { data: { commerceOptimizer: { priceBookId: GUEST_BOOK } } };
    } else if (op === 'CreateGuestCart') {
      body = { data: { createGuestCart: { cart: { id: 'CART-1' } } } };
    } else if (op === 'AddProductsToCart') {
      body = {
        data: {
          addProductsToCart: {
            cart: {
              id: 'CART-1', total_quantity: variables.items[0].quantity, items: [], prices: {},
            },
            user_errors: [],
          },
        },
      };
    } else {
      body = { data: {} };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl };
}

const acoApi = (fetchImpl, extra = {}) => createCommerce({
  backend: 'aco',
  endpoint: ACO_URL,
  coreEndpoint: CORE_URL,
  store: 'demo_fr',
  aco: { viewId: 'VIEW-1', priceBookId: 'demo_site' },
  fetchImpl,
  ...extra,
});

test('routing: catalogue goes to ACO with AC headers, price book and cart go to PaaS with Store', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: {
      AcoProductByUrlKey: () => ({ productSearch: { items: [{ productView: SIMPLE }] } }),
    },
  });
  const api = acoApi(fetchImpl);
  assert.equal(api.backend, 'aco');
  assert.equal(api.mode, 'live');
  const p = await api.getProduct('demo-cream');
  assert.equal(p.sku, 'DEMO-ACO-1');
  await api.cart.add('DEMO-ACO-1', 2);

  const [pb, product, create, add] = calls;
  assert.equal(pb.host, 'paas.example.com');
  assert.equal(pb.op, 'CommerceOptimizerPriceBook');
  assert.equal(pb.method, 'POST', 'session dependent: never GET');
  assert.equal(pb.headers.Store, 'demo_fr');

  assert.equal(product.host, 'aco.example.com');
  assert.equal(product.op, 'AcoProductByUrlKey');
  assert.equal(product.headers['AC-View-ID'], 'VIEW-1');
  assert.equal(product.headers['AC-Price-Book-ID'], GUEST_BOOK);
  assert.equal(product.headers.Store, undefined, 'no Store header on ACO');

  assert.deepEqual([create.host, create.op], ['paas.example.com', 'CreateGuestCart']);
  assert.deepEqual([add.host, add.op], ['paas.example.com', 'AddProductsToCart']);
  assert.equal(add.headers.Store, 'demo_fr');
  assert.equal(add.headers['AC-View-ID'], undefined);
  assert.deepEqual(add.variables.items, [{ sku: 'DEMO-ACO-1', quantity: 2 }]);
});

test('price book falls back to the base book when PaaS is unreachable', async () => {
  const { calls, fetchImpl } = fakeBackends({
    failCore: true,
    acoData: { AcoProductsBySku: () => ({ products: [SIMPLE] }) },
  });
  const api = acoApi(fetchImpl);
  await api.getProduct('', { sku: 'DEMO-ACO-1' });
  const aco = calls.find((c) => c.host === 'aco.example.com');
  assert.equal(aco.headers['AC-Price-Book-ID'], 'demo_site');
});

test('views that do not sell send the base price book and skip the PaaS call', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: { AcoSearch: () => ({ productSearch: { items: [] } }) },
  });
  const api = acoApi(fetchImpl, { sells: false });
  await api.search('cream');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['AC-Price-Book-ID'], 'demo_site');
});

test('SKUs without a price in the session book are re-read from the base book', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: {
      AcoSearch: () => ({
        productSearch: {
          total_count: 2,
          page_info: { current_page: 1, page_size: 12, total_pages: 1 },
          items: [{ productView: { ...SIMPLE, price: null } }, { productView: COMPLEX }],
        },
      }),
      AcoPricesBySku: (vars, headers) => {
        assert.equal(headers['AC-Price-Book-ID'], 'demo_site');
        assert.deepEqual(vars.skus, ['DEMO-ACO-1']);
        return { products: [{ sku: 'DEMO-ACO-1', price: { regular: money(50), final: money(50) } }] };
      },
    },
  });
  const res = await acoApi(fetchImpl).search('demo');
  assert.equal(res.items[0].price.final.value, 50);
  assert.equal(res.items[1].price.final.value, 800);
  assert.equal(calls.filter((c) => c.op === 'AcoPricesBySku').length, 1);
});

test('ACO listCategory: category chain, categoryPath filter and sort', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: {
      AcoCategories: (vars) => ({
        categoryTree: vars.slugs.map((s) => ({ slug: s, name: s.toUpperCase() })),
      }),
      AcoProductsByCategory: () => ({
        productSearch: { total_count: 1, items: [{ productView: SIMPLE }] },
      }),
    },
  });
  const page = await acoApi(fetchImpl).listCategory('/care/face/', { sort: 'price_desc' });
  assert.equal(page.category.urlPath, 'care/face');
  assert.deepEqual(page.category.breadcrumbs, [{ name: 'CARE', urlPath: 'care' }]);
  assert.equal(page.sort, 'price_desc');
  assert.equal(page.items[0].sku, 'DEMO-ACO-1');
  const cat = calls.find((c) => c.op === 'AcoCategories');
  assert.deepEqual(cat.variables.slugs, ['care', 'care/face']);
  const list = calls.find((c) => c.op === 'AcoProductsByCategory');
  assert.equal(list.variables.slug, 'care/face');
  assert.deepEqual(list.variables.sort, [{ attribute: 'price', direction: 'DESC' }]);
  assert.equal(await acoApi(fetchImpl).listCategory(''), null);
});

test('ACO getCategoryTree uses navigation(family: top_menu)', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: { AcoNavigation: () => ({ navigation: [{ slug: 'care', name: 'Care', children: [] }] }) },
  });
  const tree = await acoApi(fetchImpl).getCategoryTree();
  assert.deepEqual(tree.map((n) => n.urlPath), ['care']);
  assert.equal(calls[0].variables.family, 'top_menu');
});

test('a placeholder view id fails with CONFIG_ERROR, the cart still works', async () => {
  const { fetchImpl } = fakeBackends();
  const api = acoApi(fetchImpl, { aco: { viewId: 'TODO-demo-fr-catalog-view-id', priceBookId: 'demo_site' } });
  await assert.rejects(api.getProduct('demo-cream'), (e) => e.code === 'CONFIG_ERROR');
  assert.equal((await api.cart.add('DEMO-ACO-1', 1)).id, 'CART-1');
});

/* Add to cart from an ACO product */

test('configurable add to cart: parent sku with Magento option uids', async () => {
  const { calls, fetchImpl } = fakeBackends();
  const value = uid('configurable/93/14');
  await acoApi(fetchImpl).cart.add('DEMO-ACO-2', 1, { selectedOptions: [value] });
  const add = calls.find((c) => c.op === 'AddProductsToCart');
  assert.deepEqual(add.variables.items, [{ sku: 'DEMO-ACO-2', quantity: 1, selected_options: [value] }]);
  assert.equal(calls.some((c) => c.op === 'AcoRefineProduct'), false);
});

test('non Magento option ids: variant resolved with refineProduct, sent with parent_sku', async () => {
  const { calls, fetchImpl } = fakeBackends({
    acoData: { AcoRefineProduct: () => ({ refineProduct: { __typename: 'SimpleProductView', sku: 'DEMO-ACO-2-NUDE' } }) },
  });
  await acoApi(fetchImpl).cart.add('DEMO-ACO-2', 1, { selectedOptions: ['nude'] });
  const add = calls.find((c) => c.op === 'AddProductsToCart');
  assert.deepEqual(add.variables.items, [{ sku: 'DEMO-ACO-2-NUDE', parent_sku: 'DEMO-ACO-2', quantity: 1 }]);
});

test('buildCartItem', () => {
  assert.deepEqual(buildCartItem('S', 1), { sku: 'S', quantity: 1 });
  assert.deepEqual(buildCartItem('P', 1, { selectedOptions: ['x'] }), { sku: 'P', quantity: 1, selected_options: ['x'] });
  assert.deepEqual(buildCartItem('P', 2, { selectedOptions: ['x'], variantSku: 'C' }), { sku: 'C', parent_sku: 'P', quantity: 2 });
});

/* paas-core stays as before */

test('paas-core backend: catalogue and cart both on the core endpoint with Store', async () => {
  const { calls, fetchImpl } = fakeBackends();
  const api = createCommerce({
    backend: 'paas-core', endpoint: CORE_URL, store: 'demo_fr', fetchImpl,
  });
  await api.getProduct('', { sku: 'DEMO-1' });
  await api.cart.create();
  assert.deepEqual(calls.map((c) => [c.host, c.op, c.headers.Store]), [
    ['paas.example.com', 'ProductBySku', 'demo_fr'],
    ['paas.example.com', 'CreateGuestCart', 'demo_fr'],
  ]);
  assert.equal(await api.getPriceBookId(), null);
});

test('unknown backend is a config error, aco without endpoint falls back to fixtures', () => {
  assert.throws(() => createCommerce({ backend: 'nope', store: 'fr' }), (e) => e.code === 'CONFIG_ERROR');
  assert.equal(createCommerce({ backend: 'aco', store: 'fr' }).backend, 'fixture');
});

test('ACO price with tax: rounded to the cent, untouched without a rate', () => {
  const price = acoPrice({ regular: money(1165.83), final: money(832.5) });
  const ttc = acoPriceWithTax(price, 0.2);
  assert.equal(ttc.final.value, 999);
  assert.equal(ttc.regular.value, 1399);
  assert.equal(ttc.final.currency, 'EUR');
  assert.equal(ttc.discounted, true);
  assert.equal(acoPriceWithTax(acoPrice({ final: money(6.33) }), 0.2).final.value, 7.6);
  assert.equal(acoPriceWithTax(price, 0), price);
  assert.equal(acoPriceWithTax(null, 0.2), null);
});

test('aco.taxRate turns ACO prices (excl. tax) into displayed prices incl. tax', async () => {
  const { fetchImpl } = fakeBackends({
    acoData: {
      AcoProductByUrlKey: () => {
        const view = { ...SIMPLE, price: { regular: money(832.5), final: money(832.5) } };
        return { productSearch: { items: [{ productView: view }] } };
      },
      AcoSearch: () => ({ productSearch: { total_count: 1, items: [{ productView: COMPLEX }] } }),
    },
  });
  const api = acoApi(fetchImpl, { aco: { viewId: 'VIEW-1', priceBookId: 'demo_site', taxRate: 0.2 } });
  assert.equal((await api.getProduct('demo-cream')).price.final.value, 999);
  assert.equal((await api.search('demo')).items[0].price.final.value, 960);
  const plain = acoApi(fetchImpl);
  assert.equal((await plain.getProduct('demo-cream')).price.final.value, 832.5);
});
