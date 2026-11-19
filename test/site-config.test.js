import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveContext, storeCodeFor, pickSiteKey, isDevHost,
} from '../scripts/site-config.js';

const config = JSON.parse(readFileSync(new URL('../config/sites.json', import.meta.url), 'utf8'));

test('every EDS prefix maps to the expected Commerce store view code', () => {
  const expected = {
    lpg: {
      fr: 'fr', en: 'en', es: 'es', it: 'it', de: 'de', nl: 'nl', us: 'us', 'pro-fr': 'pro_fr', 'pro-en': 'pro_en',
    },
    wellbox: { fr: 'wellbox_fr', en: 'wellbox_en' },
  };
  Object.entries(expected).forEach(([site, map]) => {
    Object.entries(map).forEach(([prefix, store]) => {
      assert.equal(storeCodeFor(config, site, prefix), store, `${site} ${prefix}`);
    });
  });
  assert.equal(storeCodeFor(config, 'lpg', 'pro_fr'), null, 'underscore folder names are not accepted');
});

test('EDS prefixes use hyphens only', () => {
  Object.values(config.sites).forEach((s) => s.locales.forEach((l) => {
    assert.match(l.prefix, /^[a-z0-9-]+$/);
  }));
});

test('the lpg showcase does not sell, wellbox and pro views do', () => {
  const ctx = (host, path) => resolveContext(config, { hostname: host, pathname: path });
  assert.equal(ctx('www.example.com', '/fr/index').sells, false);
  assert.equal(ctx('www.example.com', '/fr/index').miniCart, false);
  assert.equal(ctx('www.example.com', '/pro-fr/index').sells, true);
  assert.equal(ctx('www.example.com', '/pro-fr/index').storeCode, 'pro_fr');
  assert.equal(ctx('wellbox.example.com', '/fr/index').sells, true);
  assert.equal(ctx('wellbox.example.com', '/fr/index').storeCode, 'wellbox_fr');
  assert.equal(ctx('wellbox.example.com', '/fr/index').miniCart, true);
});

test('site comes from the hostname outside dev hosts and ignores overrides there', () => {
  const env = {
    hostname: 'www.example.com', pathname: '/wellbox/fr/x', search: '?site=wellbox', storedSite: 'wellbox',
  };
  assert.equal(isDevHost(config, env.hostname), false);
  assert.equal(pickSiteKey(config, env).key, 'lpg');
  assert.equal(pickSiteKey(config, { hostname: 'wellbox.example.com' }).key, 'wellbox');
});

test('dev overrides: query, then path prefix, then storage', () => {
  const base = { hostname: 'localhost', pathname: '/fr/index' };
  assert.deepEqual(pickSiteKey(config, { ...base, search: '?site=wellbox' }), { key: 'wellbox', source: 'query' });
  assert.deepEqual(pickSiteKey(config, { ...base, storedSite: 'wellbox' }), { key: 'wellbox', source: 'storage' });
  assert.deepEqual(pickSiteKey(config, { hostname: 'localhost', pathname: '/wellbox/fr/index', storedSite: 'lpg' }), { key: 'wellbox', source: 'path' });
  assert.deepEqual(pickSiteKey(config, { ...base, search: '?site=nope' }), { key: 'lpg', source: 'default' });
  assert.equal(isDevHost(config, 'main--lpg-storefront--example-org.aem.page'), true);
});

test('dev path prefix is stripped and links keep it', () => {
  const ctx = resolveContext(config, { hostname: 'localhost', pathname: '/wellbox/fr/products/demo-device-w' });
  assert.equal(ctx.siteKey, 'wellbox');
  assert.equal(ctx.basePath, '/wellbox/fr');
  assert.equal(ctx.relativePath, '/products/demo-device-w');
  assert.equal(ctx.url('/search'), '/wellbox/fr/search');
  assert.equal(ctx.localeUrl(ctx.locales[1]), '/wellbox/en/products/demo-device-w');
});

test('unknown prefix falls back to the first locale of the site', () => {
  const ctx = resolveContext(config, { hostname: 'www.example.com', pathname: '/' });
  assert.equal(ctx.locale.prefix, 'fr');
  assert.equal(ctx.basePath, '/fr');
});

test('endpoint: empty by default, dev override only on dev hosts', () => {
  assert.equal(resolveContext(config, { hostname: 'localhost', pathname: '/fr/' }).endpoint, '');
  assert.equal(resolveContext(config, { hostname: 'localhost', pathname: '/fr/', endpointOverride: 'http://localhost:3001/graphql' }).endpoint, 'http://localhost:3001/graphql');
  assert.equal(resolveContext(config, { hostname: 'www.example.com', pathname: '/fr/', endpointOverride: 'http://evil.example.com' }).endpoint, '');
});
