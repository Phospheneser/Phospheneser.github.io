import { dataStore, createRenderGate, siteURL } from '../core/data.js';
import { getLanguage, setLanguage, initTheme } from '../core/preferences.js';
import { selectItems } from '../core/content.js';
import { createSectionRenderer } from '../renderers/sections.js';
import '../extensions.js';

let meta;
let language;
let posts = [];
let labels = {};
let renderer;
let filters = { search: '', tag: 'all' };
const gate = createRenderGate();
const list = document.getElementById('blog-post-list');
const theme = initTheme(document.getElementById('blog-dark-toggle'), { labels: () => labels });
const setText = (id, value) => { document.getElementById(id).textContent = value || ''; };

function renderPosts() {
  list.replaceChildren();
  const selected = selectItems(posts, { search: filters.search, sort: 'date-desc', language })
    .filter(post => filters.tag === 'all' || post.tags?.includes(filters.tag));
  if (!selected.length) {
    const empty = document.createElement('p'); empty.className = 'blog-empty';
    empty.textContent = labels.empty || 'No posts found.'; list.appendChild(empty);
  }
  for (const post of selected) {
    const article = document.createElement('article'); article.className = 'section-text-block blog-card';
    renderer.renderMetaCard(article, post, 'blog'); list.appendChild(article);
  }
}

function renderTags() {
  const root = document.getElementById('blog-tag-filter'); root.replaceChildren();
  const tags = [...new Set(posts.flatMap(post => post.tags || []))].sort((a, b) => a.localeCompare(b, language === 'jp' ? 'ja' : language));
  for (const [value, label] of [['all', labels.allTags || 'All topics'], ...tags.map(tag => [tag, tag])]) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'blog-tag-chip' + (value === filters.tag ? ' is-active' : '');
    button.textContent = label; button.setAttribute('aria-pressed', String(value === filters.tag));
    button.onclick = () => { filters.tag = value; renderTags(); renderPosts(); };
    root.appendChild(button);
  }
}

function renderLanguages() {
  const root = document.getElementById('blog-language-switcher'); root.replaceChildren();
  for (const lang of meta.availableLanguages) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'blog-lang-button' + (lang === language ? ' is-active' : '');
    button.textContent = meta.languageLabels?.[lang] || lang;
    button.setAttribute('aria-pressed', String(lang === language));
    button.onclick = () => { language = setLanguage(lang, meta); loadLanguage(); };
    root.appendChild(button);
  }
}

async function loadLanguage() {
  const current = gate.begin();
  const lang = language;
  list.setAttribute('aria-busy', 'true');
  try {
    const [data, copy] = await Promise.all([dataStore.content('blogs', lang), dataStore.ui(lang)]);
    if (!current()) return;
    posts = data.blogs || [];
    labels = data.page_labels || {};
    renderer = createSectionRenderer(meta, lang);
    document.title = `${data.title || 'Blog'} | ${copy.navbar_title || 'Research'}`;
    setText('blog-page-title', data.title || 'Blog');
    setText('blog-page-subtitle', data.subtitle || data.description);
    setText('blog-kicker', data.kicker || labels.kicker || 'Research Log');
    setText('blog-home-text', labels.back || 'Back to site');
    setText('blog-footer-text', copy.footer);
    document.getElementById('blog-home-link').href = siteURL(`index.html?lang=${lang}#blogs`);
    const search = document.getElementById('blog-search');
    search.placeholder = labels.search || 'Search…'; search.setAttribute('aria-label', search.placeholder); search.value = '';
    filters = { search: '', tag: 'all' };
    renderLanguages(); renderTags(); renderPosts(); theme.update();
  } catch (error) {
    if (!current()) return;
    console.error(error);
    list.textContent = 'Unable to load posts. ';
    const retry = document.createElement('button'); retry.textContent = 'Retry'; retry.onclick = loadLanguage; list.appendChild(retry);
  } finally { if (current()) list.removeAttribute('aria-busy'); }
}

document.getElementById('blog-search').addEventListener('input', event => { filters.search = event.target.value; renderPosts(); });
window.addEventListener('popstate', () => { language = getLanguage(meta); loadLanguage(); });
try {
  meta = await dataStore.meta();
  language = setLanguage(getLanguage(meta), meta);
  await loadLanguage();
} catch (error) { list.textContent = `Unable to load blog configuration: ${error.message}`; }
