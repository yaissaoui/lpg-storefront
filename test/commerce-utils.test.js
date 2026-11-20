import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTax,
  combineTransformers,
  discoveryVatTransformer,
  loadPublicConfig,
  parseProductPath,
  pdpPriceVisibilityTransformer,
  pdpVatTransformer,
} from '../scripts/commerce-utils.js';

// Raw ACO ProductView fragments. Amounts are fake but follow the observed ratios
// (832.50 excluding tax is shown 999.00 including 20 % VAT on Wellbox).
const money = (value) => ({ amount: { value, currency: 'EUR' } });
const simple = (final, regular = final, roles = ['visible']) => ({
  __typename: 'SimpleProductView',
  sku: 'DEMO-S1',
  price: { roles, final: money(final), regular: money(regular) },
});
const complex = (min, max, roles = []) => ({
  __typename: 'ComplexProductView',
  sku: 'DEMO-C1',
  options: [{ id: 'color', values: [{ __typename: 'ProductViewOptionValueSwatch', id: 'x' }] }],
  priceRange: {
    minimum: { roles, final: money(min), regular: money(min) },
    maximum: { roles, final: money(max), regular: money(max) },
  },
});

test('addTax adds the rate and rounds to the cent', () => {
  assert.equal(addTax(832.5, 0.2), 999);
  assert.equal(addTax(99, 0.2), 118.8);
  assert.equal(addTax(1165.83, 0.2), 1399);
  assert.equal(addTax(6.33, 0.2), 7.6);
  assert.equal(addTax(undefined, 0.2), undefined);
});

test('pdp VAT transformer: simple product, special price', () => {
  const out = pdpVatTransformer(simple(832.5, 1165.83), 0.2);
  assert.deepEqual(out, { prices: { regular: { amount: 1399 }, final: { amount: 999 } } });
});

test('pdp VAT transformer: configurable parent with a price range', () => {
  const out = pdpVatTransformer(complex(832.5, 1207.5), 0.2);
  assert.deepEqual(out, { prices: { final: { minimumAmount: 999, maximumAmount: 1449 } } });
});

test('pdp VAT transformer: configurable with a single price keeps the regular/final shape', () => {
  const out = pdpVatTransformer(complex(75, 75), 0.2);
  assert.deepEqual(out, { prices: { regular: { amount: 90 }, final: { amount: 90 } } });
});

test('pdp VAT transformer: tiers get the tax and the drop-in shape', () => {
  const raw = simple(10);
  raw.price.tiers = [
    { tier: money(8), quantity: [{ gte: 10 }] },
    { tier: money(9), quantity: [{ gte: 5 }] },
  ];
  const out = pdpVatTransformer(raw, 0.2);
  assert.deepEqual(out.prices.tiers, [
    { tier: { amount: 10.8, currency: 'EUR' }, quantity: 5 },
    { tier: { amount: 9.6, currency: 'EUR' }, quantity: 10 },
  ]);
});

test('pdp VAT transformer: no rate, no product, bundles: no change', () => {
  assert.equal(pdpVatTransformer(simple(10), 0), undefined);
  assert.equal(pdpVatTransformer(null, 0.2), undefined);
  const bundle = complex(10, 20);
  bundle.options[0].values[0].__typename = 'ProductViewOptionValueProduct';
  assert.equal(pdpVatTransformer(bundle, 0.2), undefined);
});

test('discovery VAT transformer keeps the raw price shapes', () => {
  const s = discoveryVatTransformer(simple(99), 0.2);
  assert.equal(s.price.final.amount.value, 118.8);
  assert.equal(s.price.final.amount.currency, 'EUR');
  assert.deepEqual(s.price.roles, ['visible']);
  const c = discoveryVatTransformer(complex(832.5, 1207.5), 0.2);
  assert.equal(c.priceRange.minimum.final.amount.value, 999);
  assert.equal(c.priceRange.maximum.regular.amount.value, 1449);
  assert.equal(discoveryVatTransformer(simple(99), 0), undefined);
});

test('transformers do not mutate the raw ACO answer', () => {
  const raw = complex(832.5, 1207.5);
  const copy = JSON.parse(JSON.stringify(raw));
  discoveryVatTransformer(raw, 0.2);
  pdpVatTransformer(raw, 0.2);
  assert.deepEqual(raw, copy);
});

test('price visibility: empty roles on a configurable range are shown, hidden stays hidden', () => {
  assert.deepEqual(pdpPriceVisibilityTransformer(complex(1, 2, [])), { prices: { visible: true } });
  assert.equal(pdpPriceVisibilityTransformer(complex(1, 2, ['hidden'])), undefined);
  assert.equal(pdpPriceVisibilityTransformer(complex(1, 2, ['visible'])), undefined);
  assert.equal(pdpPriceVisibilityTransformer(simple(1, 1, [])), undefined, 'simple products untouched');
});

test('combineTransformers merges the prices objects', () => {
  const t = combineTransformers(
    (raw) => pdpVatTransformer(raw, 0.2),
    pdpPriceVisibilityTransformer,
  );
  assert.deepEqual(t(complex(832.5, 1207.5)), {
    prices: { final: { minimumAmount: 999, maximumAmount: 1449 }, visible: true },
  });
  assert.deepEqual(combineTransformers(() => undefined)({}), undefined);
});

test('parseProductPath accepts the lab and the boilerplate URL shapes', () => {
  assert.deepEqual(parseProductPath('/wellbox/fr/products/wellbox-2-wellbox-2'), { urlKey: 'wellbox-2-wellbox-2', sku: '' });
  assert.deepEqual(parseProductPath('/fr/products/demo-serum/DEMO-001'), { urlKey: 'demo-serum', sku: 'DEMO-001' });
  assert.deepEqual(parseProductPath('/products/a%20b.html'), { urlKey: 'a b', sku: '' });
  assert.equal(parseProductPath('/wellbox/fr/accessoires-wellbox'), null);
});

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const answer = answers[path];
    if (answer instanceof Error) throw answer;
    if (!answer) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer };
  };
  fn.calls = calls;
  return fn;
}

test('site config: /config.json wins when it has a public section', async () => {
  const fetchFn = fakeFetch({ '/config.json': { public: { default: { a: 1 } } } });
  const { config, source } = await loadPublicConfig(fetchFn, 'https://x.example.com');
  assert.equal(source, '/config.json');
  assert.equal(config.public.default.a, 1);
  assert.equal(fetchFn.calls.length, 1, 'the fallback is not fetched');
});

test('site config: falls back to the committed file on 404 or a config without public', async () => {
  const committed = { public: { default: { b: 2 } } };
  let r = await loadPublicConfig(fakeFetch({ '/config/site-config.public.json': committed }), 'https://x.example.com');
  assert.equal(r.source, '/config/site-config.public.json');
  r = await loadPublicConfig(fakeFetch({ '/config.json': { data: [] }, '/config/site-config.public.json': committed }), 'https://x.example.com');
  assert.equal(r.source, '/config/site-config.public.json');
  r = await loadPublicConfig(fakeFetch({ '/config.json': new Error('offline'), '/config/site-config.public.json': committed }), 'https://x.example.com');
  assert.equal(r.config.public.default.b, 2);
});

test('site config: a clear error when nothing answers', async () => {
  await assert.rejects(loadPublicConfig(fakeFetch({}), 'https://x.example.com'), /No site configuration found.*404/);
});

test('safeRedirectPath keeps paths under the store root only', async () => {
  const { safeRedirectPath } = await import('../scripts/commerce-utils.js');
  assert.equal(safeRedirectPath('/wellbox/fr/checkout', '/wellbox/fr/'), '/wellbox/fr/checkout');
  assert.equal(safeRedirectPath('/wellbox/fr/customer/order-details?orderRef=1', '/wellbox/fr/'), '/wellbox/fr/customer/order-details?orderRef=1');
  assert.equal(safeRedirectPath('/fr/checkout', '/wellbox/fr/'), null, 'other store');
  assert.equal(safeRedirectPath('https://evil.example.com/x', '/wellbox/fr/'), null);
  assert.equal(safeRedirectPath('//evil.example.com/wellbox/fr/', '/wellbox/fr/'), null);
  assert.equal(safeRedirectPath('/\\evil.example.com', '/'), null);
  assert.equal(safeRedirectPath(['javascript', 'alert(1)'].join(':'), '/'), null);
  assert.equal(safeRedirectPath('', '/'), null);
  assert.equal(safeRedirectPath('/checkout', '/'), '/checkout', 'default root accepts any local path');
});
