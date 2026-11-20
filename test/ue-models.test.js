/*
 * Universal Editor instrumentation (da-block-collection layout): ue/models/** are the
 * sources, the three root files are built with `npm run build:json` and committed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const definitions = read('component-definition.json').groups.flatMap((g) => g.components);
const models = read('component-models.json');
const filters = read('component-filters.json');
const defIds = new Set(definitions.map((d) => d.id));
const modelIds = new Set(models.map((m) => m.id));

// Blocks that authors never place: page frame and internal helpers
const NOT_AUTHORED = ['header', 'footer', 'widget', 'modal'];
const blockDirs = readdirSync(new URL('../blocks', import.meta.url), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !NOT_AUTHORED.includes(e.name))
  .map((e) => e.name);

test('every authored block has a UE definition, so UE can select it', () => {
  blockDirs.forEach((name) => assert.ok(defIds.has(name), `missing definition for ${name}`));
});

test('every definition points to an existing model (text is native to UE)', () => {
  definitions
    .filter((d) => d.model && d.model !== 'text')
    .forEach((d) => assert.ok(modelIds.has(d.model), `${d.id} -> ${d.model}`));
});

test('sections accept every authored block, plus text and image', () => {
  const section = filters.find((f) => f.id === 'section');
  ['text', 'image', ...blockDirs].forEach((id) => assert.ok(section.components.includes(id), id));
  assert.deepEqual(filters.find((f) => f.id === 'main').components, ['section']);
});

test('container blocks list their item component', () => {
  [['cards', 'card'], ['teaser', 'teaser-item'], ['testimonials', 'testimonial']].forEach(([parent, child]) => {
    assert.ok(filters.find((f) => f.id === parent).components.includes(child), parent);
    assert.ok(defIds.has(child), child);
  });
});

test('the root files are up to date with ue/models (run npm run build:json)', () => {
  const dir = new URL('../ue/models/blocks/', import.meta.url);
  readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((file) => {
    const src = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    src.definitions.forEach((d) => assert.deepEqual(definitions.find((x) => x.id === d.id), d, `${file}: ${d.id}`));
    (src.models || []).forEach((m) => assert.deepEqual(models.find((x) => x.id === m.id), m, `${file}: model ${m.id}`));
  });
});

test('every key-value block field is a string key readBlockConfig can read', () => {
  definitions.filter((d) => d.plugins?.da?.type === 'key-value-block' && d.model !== 'page-metadata').forEach((d) => {
    const model = models.find((m) => m.id === d.model);
    model.fields.forEach((f) => assert.match(f.name, /^[a-z][a-z0-9-]*$/i, `${d.id}.${f.name}`));
  });
});
