import { siteURL } from './data.js';

export function isValidUrl(url) {
  if (typeof url !== 'string' || !url.trim() || url.trim() === '#') return false;
  try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(url, siteURL('')).protocol); }
  catch { return false; }
}

export const isExternalUrl = url => /^https?:\/\//i.test(url);
export const assetURL = path => path ? siteURL(path) : '';

// CSS chooses the icon. No per-link observers or listeners survive a rerender.
export function decorateLinkAnchor(anchor, link, label) {
  anchor.classList.add('meta-link');
  const light = link.icon || link.iconUrl || '';
  const dark = link.dark_icon || light;
  for (const [theme, path] of [['light', light], ['dark', dark]]) {
    if (!path) continue;
    const img = document.createElement('img');
    img.src = assetURL(path);
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = `meta-link-icon meta-link-icon--${theme}`;
    img.loading = 'lazy';
    anchor.appendChild(img);
  }
}

export function blogURL(entry, language) {
  if (isValidUrl(entry?.url)) return entry.url;
  if (!entry?.slug) return entry?.links?.find(link => isValidUrl(link.url))?.url || '';
  const url = new URL('blogs/post.html', siteURL(''));
  url.search = new URLSearchParams({ slug: entry.slug, lang: language });
  return url.href;
}

// Preserve author HTML and existing anchors; link only text nodes. This avoids
// applying URL regexes to generated href attributes and creating nested links.
export function linkify(value) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = value || '';
  const visit = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1 && !['A', 'SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(child.tagName)) visit(child);
      else if (child.nodeType === 3) {
        const fragment = document.createDocumentFragment();
        const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
        let offset = 0;
        for (const match of child.textContent.matchAll(pattern)) {
          fragment.appendChild(document.createTextNode(child.textContent.slice(offset, match.index)));
          const anchor = document.createElement('a');
          anchor.href = match[2] || match[3]; anchor.textContent = match[1] || match[3];
          anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; fragment.appendChild(anchor);
          offset = match.index + match[0].length;
        }
        fragment.appendChild(document.createTextNode(child.textContent.slice(offset)));
        child.replaceWith(fragment);
      }
    }
  };
  visit(wrapper);
  return wrapper;
}
