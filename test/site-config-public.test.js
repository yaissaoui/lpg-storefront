/*
 * Checks config/site-config.public.json with the drop-in's own resolver
 * (@dropins/tools/lib/aem/configs.js, vendored in scripts/__dropins__), so the test
 * follows the boilerplate rules: longest matching path key, deep merge over "default".
 * The vendored module touches a few browser globals when it loads: minimal stubs below.
 */
/* eslint-env node, browser */
/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = { getItem: () => null, setItem: () => {} };
globalThis.window = { location: { pathname: '/' }, sessionStorage: storage, localStorage: storage };
globalThis.document = { head: { appendChild() {} }, body: { classList: { toggle() {} } }, cookie: '' };

const configs = await import('../scripts/__dropins__/tools/lib/aem/configs.js');
const config = JSON.parse(readFileSync(new URL('../config/site-config.public.json', import.meta.url), 'utf8'));

function resolve(pathname) {
  window.location.pathname = pathname;
  configs.resetConfig();
  configs.initializeConfig(config);
  return {
    root: configs.getRootPath(),
    cs: configs.getHeaders('cs'),
    all: configs.getHeaders('all'),
    core: configs.getConfigValue('commerce-core-endpoint'),
    catalog: configs.getConfigValue('commerce-endpoint'),
    aco: configs.getConfigValue('adobe-commerce-optimizer'),
  };
}

const VIEWS = {
  '/fr/': ['fr', '3b06919b-2447-4d9b-9426-13cb72d40689', 'lpg_group'],
  '/en/': ['en', '97ebb532-021d-419b-af10-6507acb2626e', 'lpg_group'],
  '/wellbox/fr/': ['wellbox_fr', '8aabd439-f2ab-4d91-a9b1-548fe45b389e', 'wellbox'],
  '/wellbox/en/': ['wellbox_en', '71f025e3-6691-4141-8d92-a380017eece3', 'wellbox'],
};

test('only the keys of the boilerplate are used', () => {
  assert.deepEqual(Object.keys(config), ['public']);
  assert.deepEqual(Object.keys(config.public), ['default', ...Object.keys(VIEWS)]);
  const allowed = ['commerce-endpoint', 'commerce-core-endpoint', 'adobe-commerce-optimizer', 'headers'];
  Object.values(config.public).forEach((entry) => {
    Object.keys(entry).forEach((key) => assert.ok(allowed.includes(key), key));
  });
});

test('each store root gets its Store header, catalogue view and base price book', () => {
  Object.entries(VIEWS).forEach(([root, [store, viewId, priceBook]]) => {
    const r = resolve(`${root}products/some-url-key`);
    assert.equal(r.root, root);
    assert.equal(r.all.Store, store, root);
    assert.equal(r.cs['AC-View-ID'], viewId, root);
    assert.equal(r.cs['AC-Price-Book-ID'], priceBook, root);
    assert.equal(r.aco, true);
    assert.match(r.catalog, /^https:\/\/na1-sandbox\.api\.commerce\.adobe\.com\/[A-Za-z0-9]+\/graphql$/);
  });
});

test('Wellbox talks to the wellbox host, LPG to the main host', () => {
  assert.match(resolve('/wellbox/fr/cart').core, /^https:\/\/wellbox\.lpg-migration-.+\/graphql$/);
  assert.match(resolve('/fr/index').core, /^https:\/\/lpg-migration-.+\/graphql$/);
  assert.match(resolve('/en/').core, /^https:\/\/lpg-migration-.+\/graphql$/);
});

test('the longest prefix wins: /wellbox/fr/ is not read as an LPG path', () => {
  assert.equal(resolve('/wellbox/fr/accessoires-wellbox').root, '/wellbox/fr/');
});

test('paths outside the four roots use the default (LPG fr)', () => {
  const r = resolve('/es/products/x');
  assert.equal(r.root, '/');
  assert.equal(r.all.Store, 'fr');
});

test('no secret in the public config', () => {
  const text = JSON.stringify(config).toLowerCase();
  ['x-api-key', 'authorization', 'token', 'secret', 'password'].forEach((word) => {
    assert.equal(text.includes(word), false, word);
  });
});
