/**
 * Teaser: one row per teaser, a picture cell and a content cell, in either order.
 * The picture side follows the authored order. Variant "grey" adds a grey background.
 * @param {Element} block The teaser block element
 */
export default function decorate(block) {
  [...block.children].forEach((row) => {
    row.classList.add('teaser-item');
    const cells = [...row.children];
    cells.forEach((cell) => {
      const onlyPicture = cell.querySelector('picture') && !cell.textContent.trim();
      cell.classList.add(onlyPicture ? 'teaser-media' : 'teaser-content');
    });
    if (cells[0]?.classList.contains('teaser-content')) row.classList.add('teaser-media-right');
  });
}
