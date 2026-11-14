import { setImageSource } from '../core/images.js';
import { dataStore, siteURL } from '../core/data.js';
import { getLanguage, setLanguage, initTheme } from '../core/preferences.js';
import { decorateLinkAnchor, isValidUrl, assetURL } from '../core/links.js';

let theme;
const BLOG_LABELS = {
  readMore: {
    en: 'Read more',
    zh: '阅读全文',
    jp: '続きを読む'
  }
};

const FOOTER_FALLBACK = '© 2024 Phospheneser. All rights reserved.';

const BLOG_POST_LABELS = {
  en: {
    backBlog: 'Back to blog',
    backHome: 'Home',
    bottomBackBlog: 'Back to blog index',
    bottomBackHome: 'Return to homepage',
    darkToLight: 'Switch to light mode',
    lightToDark: 'Switch to dark mode',
    updated: 'Updated',
    reading: 'read',
    missing: 'We could not find this article. Please check the URL or return to the blog index.'
  },
  zh: {
    backBlog: '返回博客',
    backHome: '主页',
    bottomBackBlog: '返回博客列表',
    bottomBackHome: '回到主页',
    darkToLight: '切换为浅色模式',
    lightToDark: '切换为深色模式',
    updated: '更新于',
    reading: '阅读',
    missing: '未找到对应文章，请检查链接或返回博客列表。'
  },
  jp: {
    backBlog: 'ブログに戻る',
    backHome: 'ホーム',
    bottomBackBlog: 'ブログ一覧へ戻る',
    bottomBackHome: 'ホームページへ戻る',
    darkToLight: 'ライトモードへ切り替える',
    lightToDark: 'ダークモードへ切り替える',
    updated: '更新日',
    reading: '読む',
    missing: '該当の記事が見つかりませんでした。リンクをご確認いただくか、ブログ一覧に戻ってください。'
  }
};

let currentLang = 'en';
let availableLanguages = ['en', 'zh', 'jp'];
let metaConfig = null;
let postLabels = BLOG_POST_LABELS.en;

let started = false;
function start() {
  if (started) return;
  started = true;
  initializeDarkMode();
  initializePostPage().catch(error => {
    console.error(error);
    document.getElementById('post-status').textContent = 'Unable to load the article. Please reload to try again.';
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

async function initializePostPage() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  await loadMeta();
  await updateFooter(currentLang);
  if (!slug) {
    renderStatus('missing');
    return;
  }

  await loadPost(slug, currentLang);
}

async function loadMeta() {
  metaConfig = await dataStore.meta();
  availableLanguages = metaConfig.availableLanguages;
  currentLang = setLanguage(getLanguage(metaConfig), metaConfig);
}

async function loadPost(slug, lang) {
  const activeLang = lang;
  const blogsData = await fetchBlogsForLanguage(lang);
  const entry = findEntry(blogsData, slug);
  postLabels = { ...(BLOG_POST_LABELS[lang] || BLOG_POST_LABELS.en), ...blogsData.post_labels };
  renderLanguageSwitcher(slug);
  renderNavigationLabels();
  theme.update();
  if (!entry) {
    renderStatus('missing');
    return;
  }

  window.__currentPostLang = activeLang;

  document.title = `${entry.title} | ${blogsData && blogsData.title ? blogsData.title : 'Blog'}`;

  const excerpt = document.getElementById('post-excerpt');
  const title = document.getElementById('post-title');
  const meta = document.getElementById('post-meta');
  const tags = document.getElementById('post-tags');
  const cover = document.getElementById('post-cover');
  const extraLinks = document.getElementById('post-extra-links');
  const wrapper = document.getElementById('post-wrapper');
  const status = document.getElementById('post-status');

  if (status) status.textContent = '';
  if (wrapper) wrapper.hidden = false;

  title.textContent = entry.title || 'Blog Post';
  excerpt.textContent = entry.summary || entry.description || '';
  renderMeta(meta, entry);
  renderTags(tags, entry);
  renderCover(cover, entry);
  renderExtraLinks(extraLinks, entry);

  await renderContent(slug, activeLang, entry);
}

function renderMeta(container, entry) {
  if (!container) return;
  container.innerHTML = '';
  const labels = postLabels;
  const parts = [];
  if (entry.post_time) parts.push(entry.post_time);
  if (entry.updated_at) parts.push(`${labels.updated} ${entry.updated_at}`);
  if (entry.author && typeof entry.author === 'string') parts.push(entry.author);

  if (!parts.length) return;
  parts.forEach((text, index) => {
    if (index > 0) {
      const bullet = document.createElement('span');
      bullet.textContent = '·';
      container.appendChild(bullet);
    }
    const span = document.createElement('span');
    span.textContent = text;
    container.appendChild(span);
  });
}

function renderTags(container, entry) {
  if (!container) return;
  container.innerHTML = '';
  if (!entry || !Array.isArray(entry.tags) || entry.tags.length === 0) return;
  entry.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'post-tag';
    span.textContent = tag;
    container.appendChild(span);
  });
}

function renderCover(container, entry) {
  if (!container) return;
  container.innerHTML = '';
  const source = entry?.hero_image ? new URL(entry.hero_image, siteURL('blogs/')).href : assetURL(entry?.image);
  const slot = createCoverSlot(source, entry?.title);
  if (slot) container.appendChild(slot);
  container.hidden = !slot;
}

function createCoverSlot(src, title) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-cover-media';
  const hasImage = typeof src === 'string' && src.trim();
  if (!hasImage) return null;
  if (hasImage) {
    const img = document.createElement('img');
    setImageSource(img, src, { sizes: '(max-width: 960px) 100vw, 960px', eager: true });
    img.alt = title || 'Blog cover';
    wrapper.appendChild(img);
  } else {
    wrapper.classList.add('post-cover-media--placeholder');
    const span = document.createElement('span');
    span.textContent = 'Cover Placeholder';
    wrapper.appendChild(span);
  }
  return wrapper;
}

function renderExtraLinks(container, entry) {
  if (!container) return;
  container.innerHTML = '';
  const links = buildBlogExtraLinks(entry, '');
  links.forEach(link => container.appendChild(link));
}

async function renderContent(slug, lang, entry) {
  const container = document.getElementById('post-content');
  const status = document.getElementById('post-status');
  container.replaceChildren();
  const pathFor = locale => siteURL(`blogs/posts/${encodeURIComponent(slug)}/${locale}.html`);
  let path = entry.body ? siteURL(entry.body) : pathFor(lang);
  let html = await fetchContent(path);
  let contentLanguage = lang;
  if (html === null && lang !== metaConfig.defaultLanguage) {
    contentLanguage = metaConfig.defaultLanguage;
    path = pathFor(contentLanguage);
    html = await fetchContent(path);
  }
  if (html === null) {
    status.textContent = postLabels.missing;
    return;
  }
  // Only repository-authored HTML is loaded. Article scripts power the kana/audio demo.
  container.innerHTML = html;
  container.lang = contentLanguage === 'jp' ? 'ja' : contentLanguage;
  const base = new URL('./', path);
  for (const element of container.querySelectorAll('img[src], video[src], audio[src], source[src], a[href]')) {
    const attr = element.hasAttribute('src') ? 'src' : 'href';
    const raw = element.getAttribute(attr);
    if (raw && !raw.startsWith('#') && !/^(?:[a-z]+:|\/)/i.test(raw)) element.setAttribute(attr, new URL(raw, base).href);
  }
  for (const img of container.querySelectorAll('img[src]')) {
    if (!img.hasAttribute('srcset')) setImageSource(img, img.src, { sizes: '(max-width: 960px) 100vw, 960px' });
  }
  window.__currentPostLang = contentLanguage;
  await executePostScripts(container, path);
  status.textContent = contentLanguage !== lang ? (postLabels.fallback || `Showing the ${contentLanguage} version; translation is not available yet.`) : '';
  try {
    const { typesetArticle } = await import('../core/math.js');
    await typesetArticle(container, entry.math);
  } catch (error) { console.warn('Optional math rendering unavailable:', error); }
  container.dataset.loaded = 'true';
}

async function executePostScripts(container, path) {
  const base = new URL('./', path);
  window.__currentPostBaseURL = base.href;
  for (const original of container.querySelectorAll('script')) {
    const script = document.createElement('script');
    for (const attribute of original.attributes) script.setAttribute(attribute.name, attribute.value);
    const src = original.getAttribute('src');
    if (src) {
      script.src = new URL(src, base).href;
      script.async = false;
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Unable to load article script: ${src}`));
        original.replaceWith(script);
      });
    } else {
      script.textContent = original.textContent;
      original.replaceWith(script);
    }
  }
}

async function fetchContent(path) {
  const response = await fetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to load article (HTTP ${response.status})`);
  return response.text();
}

async function updateFooter(lang) {
  const footer = document.getElementById('post-footer-text');
  if (!footer) return;
  let footerText = FOOTER_FALLBACK;
  try {
    const content = await fetchWebContent(lang);
    if (content && typeof content.footer === 'string' && content.footer.trim()) {
      footerText = content.footer;
    } else if (lang !== 'en') {
      const fallbackContent = await fetchWebContent('en');
      if (fallbackContent && typeof fallbackContent.footer === 'string' && fallbackContent.footer.trim()) {
        footerText = fallbackContent.footer;
      }
    }
  } catch (err) {
    console.error(`Failed to update footer for ${lang}:`, err);
  }
  footer.textContent = footerText;
}

async function fetchWebContent(lang) { return dataStore.ui(lang); }

async function fetchBlogsForLanguage(lang) { return dataStore.content('blogs', lang); }

function findEntry(blogsData, slug) {
  if (!blogsData) return null;
  const list = Array.isArray(blogsData.blogs) ? blogsData.blogs : [];
  return list.find(item => item && item.slug === slug) || null;
}

function renderStatus(type) {
  const wrapper = document.getElementById('post-wrapper');
  const status = document.getElementById('post-status');
  if (wrapper) wrapper.hidden = true;
  if (!status) return;
  if (type === 'missing') {
    status.textContent = postLabels.missing || 'We could not find this article. Please check the URL or return to the blog index.';
  }
}

function renderLanguageSwitcher(slug) {
  const container = document.getElementById('post-language-switcher');
  if (!container) return;
  container.innerHTML = '';
  availableLanguages.forEach(lang => {
    const label = (metaConfig && metaConfig.languageLabels && metaConfig.languageLabels[lang]) || lang;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-lang-button' + (lang === currentLang ? ' is-active' : '');
    button.textContent = label;
    button.addEventListener('click', () => {
      if (lang === currentLang) return;
      const params = new URLSearchParams(window.location.search);
      params.set('lang', lang);
      params.set('slug', slug);
      window.location.search = params.toString();
    });
    container.appendChild(button);
  });
}

function renderNavigationLabels() {
  for (const id of ['post-back-to-blog', 'post-bottom-back-blog']) document.getElementById(id).href = siteURL(`blogs/index.html?lang=${currentLang}`);
  for (const id of ['post-back-to-home', 'post-bottom-back-home']) document.getElementById(id).href = siteURL(`index.html?lang=${currentLang}#blogs`);
  const labels = postLabels;
  const mapping = [
    ['post-back-blog-text', labels.backBlog],
    ['post-back-home-text', labels.backHome],
    ['post-bottom-back-blog-text', labels.bottomBackBlog],
    ['post-bottom-back-home-text', labels.bottomBackHome]
  ];
  mapping.forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function buildBlogExtraLinks(entry, blogUrl) {
  if (!entry || !Array.isArray(entry.links)) return [];
  return entry.links
    .filter(link => link && link.url && link.url !== blogUrl && isValidUrl(link.url))
    .map(link => {
      const anchor = document.createElement('a');
      anchor.href = link.url;
      const label = link.type || link.label || link.url;
      decorateLinkAnchor(anchor, link, label);
      anchor.appendChild(document.createTextNode(label));
      if (link.external === false) {
        anchor.target = '_self';
      } else {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
      anchor.classList.add('meta-link');
      return anchor;
    });
}

function initializeDarkMode() {
  theme = initTheme(document.getElementById('post-dark-toggle'), { labels: () => postLabels });
}
