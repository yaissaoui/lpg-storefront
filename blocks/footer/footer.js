import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { getSiteContext } from '../../scripts/site-config.js';
import { el } from '../../scripts/dom.js';
import t from '../../scripts/i18n.js';

/**
 * Groups "heading + list" pairs of a section into columns.
 * Authors write the footer as plain content: one heading per column, followed by a list.
 */
function buildColumns(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const columns = el('div', { class: 'footer-columns' });
  let current;
  [...wrapper.children].forEach((child) => {
    if (/^H[2-6]$/.test(child.tagName)) {
      current = el('div', { class: 'footer-column' });
      columns.append(current);
    }
    if (current) current.append(child);
  });
  if (columns.children.length) wrapper.replaceChildren(columns);
}

function languageSwitcher(ctx) {
  const id = 'footer-language';
  const select = el('select', { id, class: 'footer-language-select' });
  ctx.locales.forEach((l) => {
    select.append(el('option', { value: ctx.localeUrl(l), selected: l.prefix === ctx.locale.prefix }, l.label));
  });
  select.addEventListener('change', () => {
    window.location.href = select.value;
  });
  return el(
    'div',
    { class: 'footer-language' },
    el('label', { for: id, class: 'sr-only' }, t(ctx.lang, 'language')),
    select,
  );
}

/**
 * Footer: content from the {locale}/footer fragment (4 columns).
 * Logo and language switcher come from code.
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext();
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : ctx.url('/footer');
  let fragment = null;
  try {
    fragment = await loadFragment(footerPath);
  } catch (e) {
    fragment = null;
  }

  const { logo } = ctx.site;
  const brand = el(
    'div',
    { class: 'footer-brand' },
    el('a', { href: ctx.url('/') }, el('img', {
      src: logo.src, alt: ctx.site.label, width: logo.width, height: logo.height, loading: 'lazy',
    })),
  );

  const footer = el('div', { class: 'footer-inner' });
  const sections = fragment ? [...fragment.querySelectorAll(':scope > .section')] : [];
  sections.forEach((section, i) => {
    section.classList.add(['footer-top', 'footer-links', 'footer-legal'][i] || 'footer-extra');
    if (i === 1) buildColumns(section);
    footer.append(section);
  });
  const top = footer.querySelector('.footer-top > div') || footer.appendChild(el('div', { class: 'footer-top' }));
  top.prepend(brand);
  const legal = footer.querySelector('.footer-legal > div') || footer.appendChild(el('div', { class: 'footer-legal' }));
  legal.append(languageSwitcher(ctx));

  block.replaceChildren(footer);
}
