/*
 * Universal Editor support, after ue/scripts/ue.js of aemsites/da-block-collection
 * (Copyright 2024 Adobe, Apache-2.0). Loaded by scripts/scripts.js only on *.ue.da.live.
 *
 * Some blocks rebuild their DOM (cards and testimonials turn rows into ul > li). The UE
 * instrumentation (data-aue-* attributes) sits on the authored rows, so it is moved to the
 * new elements, otherwise UE cannot select the items any more.
 */
import { moveInstrumentation } from './ue-utils.js';

const moveRowsToItems = (mutation, listTag) => {
  const list = [...mutation.addedNodes].find((node) => node.tagName === listTag);
  if (!list) return;
  const removedRows = [...mutation.removedNodes].filter((node) => node.tagName === 'DIV');
  removedRows.forEach((div, index) => {
    if (index < list.children.length) moveInstrumentation(div, list.children[index]);
  });
};

const setupObservers = () => {
  const mutatingBlocks = document.querySelectorAll('div.cards, div.testimonials');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== 'childList' || mutation.target.tagName !== 'DIV') return;
      const type = mutation.target.classList.contains('cards-card-image')
        ? 'cards-image'
        : mutation.target.attributes['data-aue-component']?.value;

      switch (type) {
        case 'cards':
        case 'testimonials':
          // rows (div) replaced by ul > li
          moveRowsToItems(mutation, 'UL');
          break;
        case 'cards-image': {
          // picture replaced by an optimised picture
          const added = [...mutation.addedNodes].filter((node) => node.tagName === 'PICTURE');
          const removed = [...mutation.removedNodes].filter((node) => node.tagName === 'PICTURE');
          if (added.length === 1 && removed.length === 1) {
            const oldImg = removed[0].querySelector('img');
            const newImg = added[0].querySelector('img');
            if (oldImg && newImg) moveInstrumentation(oldImg, newImg);
          }
          break;
        }
        default:
          break;
      }
    });
  });

  mutatingBlocks.forEach((block) => {
    observer.observe(block, { childList: true, subtree: true });
  });
};

const setupUEEventHandlers = () => {
  // For each picture or img change, drop the stale srcsets so the new image shows
  document.body.addEventListener('aue:content-patch', ({ detail: { patch, request } }) => {
    let element = document.querySelector(`[data-aue-resource="${request.target.resource}"]`);
    if (element && element.getAttribute('data-aue-prop') !== patch.name) element = element.querySelector(`[data-aue-prop='${patch.name}']`);
    if (element?.getAttribute('data-aue-type') !== 'media') return;

    const picture = element.tagName === 'IMG' ? element.closest('picture') : element;
    picture?.querySelectorAll('source').forEach((source) => source.remove());
    picture?.querySelector('img')?.removeAttribute('srcset');
  });
};

export default () => {
  setupObservers();
  setupUEEventHandlers();
};
