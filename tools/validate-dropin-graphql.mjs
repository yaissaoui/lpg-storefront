/*
 * Validates every GraphQL operation shipped in vendored drop-ins against a Commerce GraphQL
 * schema, without executing anything.
 *
 * Usage:
 *   node tools/validate-dropin-graphql.mjs <dropins dir> <graphql endpoint> <store code> <pkg>...
 *   node tools/validate-dropin-graphql.mjs scripts/__dropins__ \
 *     https://wellbox.lpg-migration-6j6zloi-37xbp5mgn7pn2.eu-4.magentosite.cloud/graphql \
 *     wellbox_fr storefront-cart storefront-checkout storefront-order
 *
 * Each operation is sent with the fragments it uses plus one unused fragment. GraphQL
 * rejects a document with an unused fragment at validation time, so the server never runs
 * it (mutations included) and still reports every other validation error, for example
 * "Cannot query field X on type Y". Introspection is not needed (it fails on the sandbox).
 */
import fs from 'node:fs';
import path from 'node:path';

const UNUSED = 'fragment ZZ_NEVER_USED on Query { __typename }';

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return walk(path.join(dir, e.name));
  return e.name.endsWith('.js') ? [path.join(dir, e.name)] : [];
});

const stripInterpolations = (s) => s.replace(/\$\{[^}]*\}/g, ' ').replace(/\\n/g, '\n');

/** Text from `start` to the brace that closes the first `{` at or after `from`. */
function balanced(text, start, from = start) {
  const open = text.indexOf('{', from);
  let depth = 0;
  let end = open;
  while (end < text.length) {
    if (text[end] === '{') depth += 1;
    if (text[end] === '}') {
      depth -= 1;
      if (!depth) break;
    }
    end += 1;
  }
  return text.slice(start, end + 1);
}

function collectDocuments(pkgDir) {
  const docs = new Set();
  walk(pkgDir).forEach((file) => {
    [...fs.readFileSync(file, 'utf8').matchAll(/`([^`]*)`/g)].forEach((m) => {
      const s = stripInterpolations(m[1]);
      if (/(^|\n)\s*(query|mutation|fragment)\s+[A-Za-z_]/.test(s)) docs.add(s);
    });
  });
  const fragments = new Map();
  const operations = new Map();
  docs.forEach((d) => {
    // the selection set starts at the brace that ends the match (variable defaults can hold braces)
    [...d.matchAll(/fragment\s+(\w+)\s+on\s+\w+\s*\{/g)]
      .forEach((m) => fragments.set(m[1], balanced(d, m.index, m.index + m[0].length - 1)));
    [...d.matchAll(/(query|mutation)\s+(\w+)\s*(\([^)]*\))?\s*\{/g)]
      .forEach((m) => operations.set(m[2], balanced(d, m.index, m.index + m[0].length - 1)));
  });
  return { fragments, operations };
}

function withFragments(text, fragments) {
  const needed = new Set();
  const add = (t) => [...t.matchAll(/\.\.\.\s*(\w+)/g)].forEach(([, name]) => {
    if (name !== 'on' && fragments.has(name) && !needed.has(name)) {
      needed.add(name);
      add(fragments.get(name));
    }
  });
  add(text);
  return [text, ...[...needed].map((n) => fragments.get(n)), UNUSED].join('\n');
}

async function validate(endpoint, store, doc) {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Store: store },
      body: JSON.stringify({ query: doc }),
    });
    const json = await resp.json();
    if (json.data) return ['EXECUTED (unexpected)'];
    return [...new Set((json.errors || []).map((e) => e.message))]
      .filter((msg) => !msg.includes('ZZ_NEVER_USED'));
  } catch (e) {
    return [e.message];
  }
}

const [root, endpoint, store, ...pkgs] = process.argv.slice(2);
await pkgs.reduce(async (previous, pkg) => {
  await previous;
  const { fragments, operations } = collectDocuments(path.join(root, pkg));
  const results = await Promise.all([...operations].map(async ([name, text]) => [
    name, await validate(endpoint, store, withFragments(text, fragments)),
  ]));
  const failing = results.filter(([, errors]) => errors.length);
  console.log(`== ${pkg}: ${operations.size} operations, ${fragments.size} fragments, ${failing.length} with errors`);
  failing.forEach(([name, errors]) => console.log(`  ${name}: ${errors.join(' | ')}`));
}, Promise.resolve());
