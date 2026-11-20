/*
 * Page metadata table. On aem.page and aem.live the delivery pipeline turns it into <meta>
 * tags and it never reaches the page. The Universal Editor preview (*.ue.da.live) keeps it
 * in <main> so authors can select and edit it, which made UE request
 * blocks/metadata/metadata.js (404). This block keeps it visible only inside UE, as a small
 * key/value panel, and hides it everywhere else (local drafts served by `aem up`).
 * @param {Element} block The metadata block element
 */
export default function decorate(block) {
  const inEditor = /\.(stage-ue|ue)\.da\.live$/.test(window.location.hostname);
  if (!inEditor) {
    block.closest('.section')?.classList.add('metadata-only');
    block.hidden = true;
  }
}
