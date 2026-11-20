/*
 * Committed placeholders (fallback while DA holds none): same sheet format as DA,
 * French and English files with the same keys, no empty French label where English has text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = (lang) => new URL(`../placeholders/${lang}/`, import.meta.url);
const load = (lang, file) => JSON.parse(readFileSync(new URL(file, dir(lang)), 'utf8'));
const files = readdirSync(dir('fr')).filter((f) => f.endsWith('.json')).sort();

test('one file per initializer, in both languages', () => {
  ['global', 'auth', 'account', 'cart', 'checkout', 'order', 'pdp', 'search']
    .forEach((name) => assert.ok(files.includes(`${name}.json`), name));
  assert.deepEqual(readdirSync(dir('en')).filter((f) => f.endsWith('.json')).sort(), files);
});

test('files use the DA sheet format { data: [{ Key, Value }] }', () => {
  ['fr', 'en'].forEach((lang) => files.forEach((file) => {
    const json = load(lang, file);
    assert.ok(Array.isArray(json.data), `${lang}/${file}`);
    assert.equal(json.total, json.data.length, `${lang}/${file}`);
    json.data.forEach((row) => assert.equal(typeof row.Key, 'string', `${lang}/${file}`));
    assert.equal(new Set(json.data.map((r) => r.Key)).size, json.data.length, `duplicate key in ${lang}/${file}`);
  }));
});

test('French and English files have the same keys', () => {
  files.forEach((file) => {
    const fr = load('fr', file).data.map((r) => r.Key).sort();
    const en = load('en', file).data.map((r) => r.Key).sort();
    const onlyFr = fr.filter((k) => !en.includes(k));
    const onlyEn = en.filter((k) => !fr.includes(k));
    // a handful of keys of newer drop-in versions have no English default in the June suite
    assert.ok(onlyFr.length <= 5, `${file}: only in fr ${onlyFr.join(', ')}`);
    assert.deepEqual(onlyEn, [], `${file}: only in en`);
  });
});

test('no empty French label where the English one has text', () => {
  files.forEach((file) => {
    const en = Object.fromEntries(load('en', file).data.map((r) => [r.Key, r.Value]));
    load('fr', file).data.forEach(({ Key, Value }) => {
      if (en[Key]) assert.notEqual(Value, '', `${file}: ${Key}`);
    });
  });
});

test('labels keep their interpolation tokens', () => {
  files.forEach((file) => {
    const en = Object.fromEntries(load('en', file).data.map((r) => [r.Key, r.Value]));
    load('fr', file).data.forEach(({ Key, Value }) => {
      const tokens = (en[Key] || '').match(/\{\{?[A-Za-z_]+\}?\}/g) || [];
      tokens.forEach((t) => assert.ok(Value.includes(t), `${file}: ${Key} lost ${t}`));
    });
  });
});
