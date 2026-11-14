import { images, defaultBackground } from '../generated/assets.js';
import { siteRoot, siteURL } from './data.js';

function entryFor(source) {
  if (!source) return null;
  try {
    const url = new URL(source, siteRoot);
    if (url.origin !== siteRoot.origin || !url.pathname.startsWith(siteRoot.pathname) || url.search || url.hash) return null;
    return images[decodeURIComponent(url.pathname.slice(siteRoot.pathname.length))];
  } catch { return null; }
}

// Unknown/new/external images keep working before the next asset build.
export function setImageSource(image, source, { sizes = '(max-width: 768px) 100vw, 240px', maxWidth = 1920, eager = false } = {}) {
  const entry = entryFor(source);
  image.decoding = 'async';
  image.loading = eager ? 'eager' : 'lazy';
  if (eager) image.setAttribute('fetchpriority', 'high');
  else image.removeAttribute('fetchpriority');
  image.removeAttribute('srcset'); image.removeAttribute('sizes');
  if (entry) {
    const candidates = entry.variants.filter(item => item.width <= maxWidth);
    if (!candidates.length) candidates.push(entry.variants[0]);
    const fallback = candidates.find(item => item.width >= 640) || candidates.at(-1);
    // Set selection hints before src, avoiding a speculative original download.
    image.sizes = sizes;
    image.srcset = candidates.map(item => `${siteURL(item.src)} ${item.width}w`).join(', ');
    image.width = entry.width; image.height = entry.height;
    image.src = siteURL(fallback.src);
  } else image.src = source ? siteURL(source) : '';
}

export function backgroundImage(source) {
  if (!source) return 'none';
  if (new URL(source, siteRoot).href === siteURL(defaultBackground)) return 'var(--site-default-background)';
  const entry = entryFor(source);
  const variant = entry?.variants.find(item => item.width >= 1280) || entry?.variants.at(-1);
  return `url("${siteURL(variant?.src || source)}")`;
}
