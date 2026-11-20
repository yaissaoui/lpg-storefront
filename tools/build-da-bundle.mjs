/*
 * Lab helper: builds the DA.live pages (path -> HTML) from drafts/ and from the ACO catalogue view
 * of wellbox_fr. Product pages are a stopgap until the BYOM service renders them.
 * Usage: node tools/build-da-bundle.mjs > /tmp/da-bundle.json
 */
import { readFileSync } from 'node:fs';

const ACO = 'https://na1-sandbox.api.commerce.adobe.com/QD1T4hbz1zGxLHYpp8cyPy/graphql';
const VIEW = '8aabd439-f2ab-4d91-a9b1-548fe45b389e';
const wrap = (inner) => `<body><header></header><main>${inner}</main><footer></footer></body>`;
const draft = (p) => readFileSync(new URL(`../drafts/${p}.plain.html`, import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replaceAll('/wellbox/fr/products/demo-device-w', '/wellbox/fr/products/wellbox-2-wellbox-2')
  .replaceAll('"/wellbox/fr/appareils"', '"/wellbox/fr/wellbox-produits"')
  .replaceAll('"/wellbox/fr/accessoires"', '"/wellbox/fr/accessoires-wellbox"')
  .replaceAll('<div>accessoires</div>', '<div>accessoires-wellbox</div>');

const aco = async (query) => (await (await fetch(ACO, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'AC-View-ID': VIEW, 'AC-Price-Book-ID': 'wellbox' },
  body: JSON.stringify({ query }),
})).json()).data;

const pages = {
  '/fr/index': draft('fr/index'),
  '/fr/footer': draft('fr/footer'),
  '/fr/search': draft('fr/search'),
  '/wellbox/fr/index': draft('wellbox/fr/index'),
  '/wellbox/fr/footer': draft('wellbox/fr/footer'),
  '/wellbox/fr/search': draft('fr/search'),
};

const nav = (await aco('{ navigation(family:"top_menu"){ slug children{ slug } } }')).navigation;
const slugs = nav.flatMap((n) => [n.slug, ...(n.children || []).map((c) => c.slug)]);
slugs.forEach((s) => { pages[`/wellbox/fr/${s}`] = '<div><div class="product-list"><div><div>page-size</div><div>12</div></div></div></div>'; });

const pdp = draft('wellbox/fr/products/wellbox-2-wellbox-2');
const keys = new Set();
for (let p = 1; p <= 5; p += 1) {
  // eslint-disable-next-line no-await-in-loop
  const d = (await aco(`{ productSearch(phrase:"", page_size:50, current_page:${p}){ page_info{ total_pages } items{ productView{ urlKey } } } }`)).productSearch;
  d.items.forEach((i) => i.productView?.urlKey && keys.add(i.productView.urlKey));
  if (p >= d.page_info.total_pages) break;
}
keys.forEach((k) => { pages[`/wellbox/fr/products/${k}`] = pdp; });

const out = Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, wrap(v)]));
process.stderr.write(`${Object.keys(out).length} pages: ${slugs.length} categories, ${keys.size} products\n`);
process.stdout.write(JSON.stringify(out));
