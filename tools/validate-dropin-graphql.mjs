// Validates every GraphQL operation shipped in the vendored drop-ins against the PaaS schema.
// An unused fragment is appended so the server rejects the document at validation time and
// never executes it (no side effects, even for mutations).
import fs from 'node:fs';
import path from 'node:path';
const [root, endpoint, store, ...pkgs] = process.argv.slice(2);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const strip = (s) => s.replace(/\$\{[^}]*\}/g, ' ').replace(/\\n/g, '\n');
for (const pkg of pkgs) {
  const docs = new Set();
  for (const f of walk(path.join(root, pkg))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/`([^`]*)`/g)) {
      const s = strip(m[1]);
      if (/^\s*(query|mutation|fragment)\s+[A-Za-z_]/.test(s) || /\n\s*(query|mutation)\s+[A-Za-z_]/.test(s)) docs.add(s);
    }
  }
  const fragments = new Map();
  const ops = [];
  for (const d of docs) {
    for (const m of d.matchAll(/fragment\s+([A-Za-z_0-9]+)\s+on\s+[A-Za-z_0-9]+\s*\{/g)) {
      // extract balanced fragment body
      let i = d.indexOf('{', m.index); let depth = 0; let j = i;
      for (; j < d.length; j += 1) { if (d[j] === '{') depth += 1; else if (d[j] === '}') { depth -= 1; if (!depth) break; } }
      fragments.set(m[1], d.slice(m.index, j + 1));
    }
    for (const m of d.matchAll(/(query|mutation)\s+([A-Za-z_0-9]+)\s*(\([^)]*\))?\s*\{/g)) {
      let i = d.indexOf('{', m.index + m[0].length - 1); let depth = 0; let j = i;
      for (; j < d.length; j += 1) { if (d[j] === '{') depth += 1; else if (d[j] === '}') { depth -= 1; if (!depth) break; } }
      ops.push({ name: m[2], text: d.slice(m.index, j + 1) });
    }
  }
  const uniq = new Map(ops.map((o) => [o.name, o]));
  const problems = [];
  for (const op of uniq.values()) {
    const needed = new Set();
    const add = (t) => { for (const m of t.matchAll(/\.\.\.\s*([A-Za-z_0-9]+)/g)) { if (m[1] !== 'on' && !needed.has(m[1]) && fragments.has(m[1])) { needed.add(m[1]); add(fragments.get(m[1])); } } };
    add(op.text);
    const doc = `${op.text}\n${[...needed].map((n) => fragments.get(n)).join('\n')}\nfragment ZZ_NEVER_USED on Query { __typename }`;
    // eslint-disable-next-line no-await-in-loop
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', Store: store }, body: JSON.stringify({ query: doc }) }).then((x) => x.json()).catch((e) => ({ errors: [{ message: e.message }] }));
    const msgs = (r.errors || []).map((e) => e.message).filter((m) => !/ZZ_NEVER_USED/.test(m));
    if (r.data) problems.push(`${op.name}: EXECUTED?!`);
    if (msgs.length) problems.push(`${op.name}: ${[...new Set(msgs)].join(' | ')}`);
  }
  console.log(`== ${pkg}: ${uniq.size} operations, ${fragments.size} fragments, ${problems.length} with errors`);
  problems.forEach((p) => console.log(`  ${p}`));
}
