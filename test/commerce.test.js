import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommerce, CommerceError } from '../scripts/commerce/index.js';
import {
  normaliseProduct, normalisePrice, normaliseCategoryTree, attributesToMap, normaliseCart,
} from '../scripts/commerce/normalise.js';
import { buildGetUrl, createHttpTransport } from '../scripts/commerce/client.js';

/* Normalisation */

test('normalisePrice flags discounts and survives missing data', () => {
  const p = normalisePrice({
    minimum_price: {
      regular_price: { value: 1299, currency: 'EUR' },
      final_price: { value: 999, currency: 'EUR' },
    },
  });
  assert.deepEqual(p, {
    regular: { value: 1299, currency: 'EUR' },
    final: { value: 999, currency: 'EUR' },
    discounted: true,
  });
  assert.equal(normalisePrice(null), null);
  assert.equal(normalisePrice({ minimum_price: {} }), null);
});

test('normaliseProduct builds the stable shape from a raw 2.4.7 payload', () => {
  const raw = {
    __typename: 'ConfigurableProduct',
    uid: 'UID1',
    sku: 'DEMO-100',
    name: 'Demo product',
    url_key: 'demo-product',
    stock_status: 'IN_STOCK',
    short_description: { html: '<p>short</p>' },
    description: { html: '<p>long</p>' },
    meta_title: null,
    small_image: { url: 'https://cdn.example.com/a.jpg', label: 'A' },
    media_gallery: [
      { url: 'https://cdn.example.com/b.jpg', label: 'B', position: 2 },
      {
        url: 'https://cdn.example.com/hidden.jpg', label: 'H', position: 0, disabled: true,
      },
      { url: 'https://cdn.example.com/a.jpg', label: 'A', position: 1 },
    ],
    price_range: { minimum_price: { regular_price: { value: 10, currency: 'EUR' }, final_price: { value: 10, currency: 'EUR' } } },
    categories: [
      { uid: 'C1', name: 'Top', url_path: 'top' },
      {
        uid: 'C2',
        name: 'Leaf',
        url_path: 'top/leaf',
        breadcrumbs: [{ category_uid: 'C1', category_name: 'Top', category_url_path: 'top' }],
      },
    ],
    custom_attributesV2: { items: [{ code: 'application', value: '<p>apply</p>' }, { code: 'skin', selected_options: [{ label: 'Dry', value: '1' }, { label: 'Oily', value: '2' }] }] },
    configurable_options: [{
      uid: 'O1', attribute_code: 'size', label: 'Size', values: [{ uid: 'V1', label: '30 ml' }],
    }],
  };
  const p = normaliseProduct(raw);
  assert.equal(p.type, 'configurable');
  assert.equal(p.urlKey, 'demo-product');
  assert.equal(p.metaTitle, 'Demo product', 'falls back to the name');
  assert.deepEqual(p.images.map((i) => i.label), ['A', 'B'], 'sorted, disabled removed');
  assert.deepEqual(p.attributes, { application: '<p>apply</p>', skin: 'Dry, Oily' });
  assert.deepEqual(p.breadcrumbs, [{ name: 'Top', urlPath: 'top' }, { name: 'Leaf', urlPath: 'top/leaf' }]);
  assert.deepEqual(p.options, [{
    id: 'O1', code: 'size', label: 'Size', values: [{ id: 'V1', label: '30 ml' }],
  }]);
  assert.equal(p.inStock, true);
  assert.equal(normaliseProduct(null), null);
});

test('attributesToMap ignores junk', () => {
  assert.deepEqual(attributesToMap([null, {}, { code: 'a', value: 'x' }]), { a: 'x' });
});

test('category tree drops the root and hidden entries, sorts by position', () => {
  const tree = normaliseCategoryTree([{
    uid: 'R',
    name: 'Root',
    children: [
      {
        uid: 'B', name: 'B', url_path: 'b', position: 2, include_in_menu: 1,
      },
      {
        uid: 'H', name: 'H', url_path: 'h', position: 0, include_in_menu: 0,
      },
      {
        uid: 'A', name: 'A', url_path: 'a', position: 1, include_in_menu: 1,
      },
    ],
  }]);
  assert.deepEqual(tree.map((n) => n.id), ['A', 'B']);
  assert.deepEqual(normaliseCategoryTree([]), []);
});

test('normaliseCart maps lines and totals', () => {
  const c = normaliseCart({
    id: 'X',
    total_quantity: 2,
    items: [{
      uid: 'L1', quantity: 2, product: { sku: 'S', name: 'N', url_key: 'n' }, prices: { row_total: { value: 20, currency: 'EUR' } },
    }],
    prices: { grand_total: { value: 20, currency: 'EUR' } },
  });
  assert.equal(c.items[0].rowTotal.value, 20);
  assert.equal(c.items[0].unitPrice, null);
  assert.equal(c.grandTotal.value, 20);
  assert.equal(c.subtotal, null);
});

test('normaliseCart keeps unit prices and row totals with and without tax', () => {
  const eur = (value) => ({ value, currency: 'EUR' });
  const c = normaliseCart({
    id: 'X',
    total_quantity: 2,
    items: [{
      uid: 'L1',
      quantity: 2,
      product: { sku: 'S', name: 'N', url_key: 'n' },
      prices: {
        price: eur(832.5),
        price_including_tax: eur(999),
        row_total: eur(1665),
        row_total_including_tax: eur(1998),
      },
    }],
    prices: { grand_total: eur(1998) },
  });
  const [line] = c.items;
  const values = [line.unitPrice, line.unitPriceInclTax, line.rowTotal, line.rowTotalInclTax]
    .map((m) => m.value);
  assert.deepEqual(values, [832.5, 999, 1665, 1998]);
});

/* Fixture mode */

test('no endpoint means fixture mode with DEMO data only', async () => {
  const api = createCommerce({ store: 'fr' });
  assert.equal(api.mode, 'fixture');
  const p = await api.getProduct('demo-serum-a');
  assert.equal(p.sku, 'DEMO-001');
  assert.equal(p.name, 'Demo serum A');
  assert.match(p.image.url, /^\/images\/demo\/.+\.svg$/);
  assert.equal(p.options[0].values.length, 2);
  assert.equal(await api.getProduct('does-not-exist'), null);
});

test('fixture listCategory paginates and sorts', async () => {
  const api = createCommerce({ store: 'fr' });
  const page1 = await api.listCategory('/expertise-esthetique/cosmetiques/cosmetiques-visage/', { page: 1, pageSize: 5, sort: 'price_asc' });
  assert.equal(page1.category.name, 'Cosmétiques visage');
  assert.equal(page1.page.totalCount, 8);
  assert.equal(page1.page.totalPages, 2);
  assert.equal(page1.items.length, 5);
  const prices = page1.items.map((i) => i.price.final.value);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const page2 = await api.listCategory('expertise-esthetique/cosmetiques/cosmetiques-visage', { page: 2, pageSize: 5 });
  assert.equal(page2.items.length, 3);
  assert.equal(await api.listCategory('nope'), null);
});

test('fixture search and category tree follow the store site', async () => {
  const lpg = createCommerce({ store: 'pro_fr' });
  const wb = createCommerce({ store: 'wellbox_fr' });
  assert.equal((await lpg.search('serum')).page.totalCount, 1);
  assert.equal((await lpg.search('')).items.length, 0);
  assert.deepEqual((await wb.getCategoryTree()).map((c) => c.urlPath), ['appareils', 'accessoires', 'cosmetiques']);
  assert.ok((await lpg.getCategoryTree()).every((c) => c.urlPath !== 'hidden-demo'));
  const device = await wb.getProduct('demo-device-w');
  assert.equal(device.price.final.value, 999);
  assert.equal(device.price.discounted, true);
});

test('fixture cart: create, add, merge lines, errors, lost cart recovery', async () => {
  const events = [];
  const api = createCommerce({ store: 'wellbox_fr', onCartChange: (c) => events.push(c.totalQuantity) });
  assert.equal((await api.cart.get()).totalQuantity, 0);
  let c = await api.cart.add('DEMO-W02', 1);
  c = await api.cart.add('DEMO-W02', 2);
  assert.equal(c.items.length, 1);
  assert.equal(c.totalQuantity, 3);
  assert.equal(c.grandTotal.value, 210);
  c = await api.cart.add('DEMO-W01', 1, { selectedOptions: ['Y29sL3doaXRl'] });
  assert.deepEqual(c.items[1].options, [{ label: 'Couleur', value: 'Blanche' }]);
  assert.deepEqual(events, [1, 3, 4]);
  await assert.rejects(api.cart.add('NOPE', 1), (e) => e instanceof CommerceError && e.code === 'PRODUCT_NOT_FOUND');
  await assert.rejects(api.cart.add('DEMO-W02', 0), (e) => e.code === 'INVALID_INPUT');
  const lpg = createCommerce({ store: 'fr' });
  await assert.rejects(lpg.cart.add('DEMO-008', 1), (e) => e.code === 'INSUFFICIENT_STOCK');

  // A cart id the backend no longer knows is dropped and a new cart is created.
  const storage = new Map();
  const box = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  box.setItem('commerce-cart:wellbox_fr', 'expired-id');
  const api2 = createCommerce({ store: 'wellbox_fr', storage: box });
  assert.equal((await api2.cart.get()).totalQuantity, 0);
  assert.equal(box.getItem('commerce-cart:wellbox_fr'), null);
  box.setItem('commerce-cart:wellbox_fr', 'expired-id');
  assert.equal((await api2.cart.add('DEMO-W03', 1)).totalQuantity, 1);
  assert.notEqual(box.getItem('commerce-cart:wellbox_fr'), 'expired-id');
});

/* Live transport (fetch mocked) */

test('cacheable queries use GET with the Store header, mutations use POST', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = init.method === 'GET'
      ? { data: { products: { items: [] } } }
      : { data: { createGuestCart: { cart: { id: 'CART1' } } } };
    return { ok: true, status: 200, json: async () => body };
  };
  const api = createCommerce({ endpoint: 'https://sandbox.example.com/graphql', store: 'pro_fr', fetchImpl });
  assert.equal(api.mode, 'live');
  await api.getProduct('x');
  await api.cart.create();
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Store, 'pro_fr');
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('operationName'), 'ProductByUrlKey');
  assert.deepEqual(JSON.parse(u.searchParams.get('variables')), { urlKey: 'x' });
  assert.ok(!u.searchParams.get('query').includes('\n'), 'query is minified');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.Store, 'pro_fr');
  assert.equal(JSON.parse(calls[1].init.body).operationName, 'CreateGuestCart');
});

test('GraphQL errors with null data become CommerceError', async () => {
  const transport = createHttpTransport({
    endpoint: 'https://sandbox.example.com/graphql',
    store: 'fr',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: 'boom' }], data: { products: null } }) }),
  });
  const api = createCommerce({ store: 'fr', transport });
  await assert.rejects(api.getProduct('x'), (e) => e instanceof CommerceError && e.message === 'boom');
});

test('buildGetUrl keeps an existing query string', () => {
  const url = buildGetUrl('https://h.example.com/graphql?x=1', { query: 'query  A { a }', operationName: 'A' });
  assert.ok(url.startsWith('https://h.example.com/graphql?x=1&query='));
});
