/*
 * Search results page on the storefront-product-discovery drop-in. Reads ?q=.
 * Block config (optional): page-size.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { getSiteContext } from '../../scripts/site-config.js';
import renderProductDiscovery from '../../scripts/product-discovery.js';
import t from '../../scripts/i18n.js';

export default async function decorate(block) {
  const ctx = await getSiteContext();
  const config = readBlockConfig(block);
  const pageSize = Math.min(48, Math.max(1, parseInt(config['page-size'], 10) || 12));
  const term = (new URLSearchParams(window.location.search).get('q') || '').trim();

  const form = document.createElement('form');
  form.className = 'search-form';
  form.setAttribute('role', 'search');
  form.action = window.location.pathname;
  form.innerHTML = `<label for="search-page-input" class="sr-only"></label>
    <input id="search-page-input" type="search" name="q">
    <button type="submit" class="button primary"></button>`;
  form.querySelector('label').textContent = t(ctx.lang, 'search');
  form.querySelector('input').value = term;
  form.querySelector('input').placeholder = t(ctx.lang, 'searchPlaceholder');
  form.querySelector('button').textContent = t(ctx.lang, 'search');

  const results = document.createElement('div');
  results.className = 'search-results';
  block.replaceChildren(form, results);
  await renderProductDiscovery(results, { pageSize });
}
