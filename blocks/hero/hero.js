/**
 * Hero: full-width image or video with an uppercase title.
 * Content: a picture (or a link to an .mp4 file) and a heading, optional text and buttons.
 * A video only starts after the page is loaded and is skipped when the visitor prefers
 * reduced motion, so it never competes with the LCP image.
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  const picture = block.querySelector('picture');
  const videoLink = [...block.querySelectorAll('a[href]')].find((a) => /\.mp4($|\?)/i.test(a.getAttribute('href')));

  const media = document.createElement('div');
  media.className = 'hero-media';
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
    }
    media.append(picture);
  }

  if (videoLink) {
    const src = videoLink.getAttribute('href');
    const holder = videoLink.closest('p') || videoLink;
    holder.remove();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const addVideo = () => {
        const video = document.createElement('video');
        Object.assign(video, {
          muted: true, loop: true, autoplay: true, playsInline: true,
        });
        video.setAttribute('muted', '');
        video.setAttribute('aria-hidden', 'true');
        video.src = src;
        media.append(video);
        block.classList.add('hero-has-video');
      };
      if (document.readyState === 'complete') addVideo();
      else window.addEventListener('load', addVideo, { once: true });
    }
  }

  const content = document.createElement('div');
  content.className = 'hero-content';
  block.querySelectorAll(':scope > div > div').forEach((cell) => {
    if (cell.textContent.trim()) content.append(...cell.childNodes);
  });
  content.querySelectorAll('p:empty').forEach((p) => p.remove());

  block.replaceChildren(media, content);
}
