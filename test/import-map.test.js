/*
 * Every bare @dropins/* specifier used by the project resolves through the import map of
 * head.html and 404.html, and every mapped folder exists in scripts/__dropins__.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const importMap = (file) => {
  const html = readFileSync(new URL(file, root), 'utf8');
  const json = html.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/)[1];
  return JSON.parse(json).imports;
};
const walk = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return e.name === '__dropins__' ? [] : walk(`${dir}${e.name}/`);
  return e.name.endsWith('.js') ? [`${dir}${e.name}`] : [];
});

test('head.html and 404.html share the same import map', () => {
  assert.deepEqual(importMap('404.html'), importMap('head.html'));
});

test('every mapped drop-in is vendored', () => {
  Object.values(importMap('head.html')).forEach((path) => {
    assert.ok(existsSync(new URL(`.${path}`, root)), path);
  });
});

test('every @dropins/* import of the project is mapped and points to an existing file', () => {
  const map = importMap('head.html');
  const files = [...walk('blocks/'), ...walk('scripts/')];
  files.forEach((file) => {
    const src = readFileSync(new URL(file, root), 'utf8');
    [...src.matchAll(/from '(@dropins\/[^']+)'|import\('(@dropins\/[^']+)'\)|import '(@dropins\/[^']+)'/g)]
      .map((m) => m[1] || m[2] || m[3])
      .forEach((spec) => {
        const prefix = Object.keys(map).find((p) => spec.startsWith(p));
        assert.ok(prefix, `${file}: ${spec} is not in the import map`);
        const target = `.${map[prefix]}${spec.slice(prefix.length)}`;
        assert.ok(existsSync(new URL(target, root)), `${file}: ${spec} -> ${target} missing`);
      });
  });
});
