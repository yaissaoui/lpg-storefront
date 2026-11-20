/*
 * Product list (PLP) on the storefront-product-discovery drop-in.
 * Block config (optional): category = Commerce url_path, page-size = number.
 * Without a category the url_path is the page path after the locale prefix
 * (/wellbox/fr/accessoires-wellbox -> accessoires-wellbox).
 * Variant "compact": a row of products inside another page (PDP, home).
 * Production PLPs should come from BYOM or JSON2HTML for SEO (see README).
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { getCategory } from '../../scripts/commerce.js';
import { getSiteContext } from '../../scripts/site-config.js';
import renderProductDiscovery from '../../scripts/product-discovery.js';

function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, name);
    document.head.append(meta);
  }
  meta.setAttribute('content', content);
}

export default async function decorate(block) {
  const ctx = await getSiteContext();
  const config = readBlockConfig(block);
  const category = (config.category || ctx.relativePath).replace(/^\/+|\/+$/g, '');
  const compact = block.classList.contains('compact');
  const pageSize = Math.min(48, Math.max(1, parseInt(config['page-size'] || config.pagesize, 10) || 12));

  const heading = compact ? null : getCategory(category).catch(() => null);
  // Page title and description as soon as the category is known, whatever happens to the
  // product list. Without a Title in the page metadata, EDS names the page after its first
  // block ("Product List"); the DA page metadata is the server-side fix (SEO).
  heading?.then((info) => {
    if (!info) return;
    if (info.metaTitle) {
      document.title = info.metaTitle;
      setMeta('og:title', info.metaTitle, 'property');
    }
    setMeta('description', info.metaDescription);
  });
  await renderProductDiscovery(block, { category, pageSize, compact });

  const info = await heading;
  if (!info) return;
  const head = document.createElement('div');
  head.className = 'product-list-head';
  // Authors may already give the page a title. Only add one when the page has none.
  if (!document.querySelector('main h1')) {
    const h1 = document.createElement('h1');
    h1.textContent = info.name;
    head.append(h1);
  }
  block.prepend(head);
}
