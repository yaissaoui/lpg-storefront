import { getSiteContext } from '../../scripts/site-config.js';
import t from '../../scripts/i18n.js';

/**
 * Testimonials, simplified slider: native horizontal scroll with snap points and two buttons.
 * One row per testimonial: quote cell, then author cell.
 * @param {Element} block The testimonials block element
 */
export default async function decorate(block) {
  const ctx = await getSiteContext().catch(() => ({ lang: 'fr' }));
  const track = document.createElement('ul');
  track.className = 'testimonials-track';
  track.tabIndex = 0;

  [...block.children].forEach((row) => {
    const [quote, author] = row.children;
    const li = document.createElement('li');
    li.className = 'testimonials-item';
    const figure = document.createElement('figure');
    const blockquote = document.createElement('blockquote');
    if (quote) blockquote.append(...quote.childNodes);
    figure.append(blockquote);
    if (author?.textContent.trim()) {
      const caption = document.createElement('figcaption');
      caption.append(...author.childNodes);
      figure.append(caption);
    }
    li.append(figure);
    track.append(li);
  });

  const nav = document.createElement('div');
  nav.className = 'testimonials-nav';
  [['prev', -1, 'previousSlide'], ['next', 1, 'nextSlide']].forEach(([name, dir, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `testimonials-${name}`;
    button.setAttribute('aria-label', t(ctx.lang, label));
    button.addEventListener('click', () => {
      const item = track.querySelector('.testimonials-item');
      const step = item ? item.getBoundingClientRect().width + 24 : track.clientWidth;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    });
    nav.append(button);
  });

  block.replaceChildren(track, nav);
}
