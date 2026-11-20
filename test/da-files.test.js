/*
 * Files prepared for DA and the configuration service (tools/da) stay in line with the
 * committed sources. Rebuild with `node tools/da/build-da-files.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ROOTS, toDaSheet } from '../tools/da/build-da-files.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('one placeholder sheet per file, language and store root, in the boilerplate sheet shape', () => {
  Object.entries(ROOTS).forEach(([root, lang]) => {
    const files = readdirSync(new URL(`../placeholders/${lang}/`, import.meta.url)).filter((f) => f.endsWith('.json'));
    files.forEach((file) => {
      const sheet = read(`tools/da/placeholders/${root || '_root'}/${file}`);
      assert.deepEqual(sheet, toDaSheet(read(`placeholders/${lang}/${file}`).data), `${root}/${file} is stale`);
      assert.deepEqual(sheet[':names'], ['data', 'dnt']);
      assert.deepEqual(Object.keys(sheet.data.data[0]), ['Key', 'Value'], 'fetchPlaceholders reads Key and Value');
    });
  });
});

test('the public config body is the "public" object of the committed fallback', () => {
  assert.deepEqual(read('tools/da/public-config.json'), read('config/site-config.public.json').public);
});
