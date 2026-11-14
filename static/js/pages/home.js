import { dataStore, createRenderGate, siteURL } from '../core/data.js';
import { getLanguage, setLanguage, initTheme, storage } from '../core/preferences.js';
import { localize } from '../core/content.js';
import { createScope } from '../core/lifecycle.js';
import { backgroundImage } from '../core/images.js';
import { navigation as navigationLabels } from '../generated/assets.js';
import { createSectionRenderer } from '../renderers/sections.js';
import { mountHero } from '../components/hero.js';
import { mountList } from '../plugins.js';
import { attachServiceWarmup } from '../core/service-warmup.js';
import '../extensions.js';

const multi = document.body.dataset.layout === 'multi';
const mode = multi ? 'multiPage' : 'singlePage';
const root = document.getElementById(multi ? 'content-root' : 'meta-sections-root');
const background = document.getElementById('background-container');
const lifetime = createScope();
const gate = createRenderGate();
let pageScope = createScope();
let meta;
let language;
let theme;
let diviner;
let singleHero = multi ? null : background.querySelector(':scope > .container');
const text = (id, value) => { const el = document.getElementById(id); if (el && value != null) el.innerHTML = value; };
const pageKey = () => multi ? new URLSearchParams(location.search).get('page') || 'home' : location.hash.slice(1) || 'home';
const visibleSections = () => meta.sections.filter(section => section.enabled && section[mode]?.enabled);

function applyBackground() {
  if (!meta) return;
  if (!multi) root.classList.toggle('anchor-navigation', Boolean(location.hash));
  const section = meta.sections.find(item => item.id === pageKey());
  const config = meta.backgrounds?.[section?.background] || meta.backgrounds?.[pageKey()] || meta.backgrounds?.default || {};
  const dark = document.body.classList.contains('dark-mode');
  const image = dark ? config.dark || config.light : config.light || config.dark;
  background.style.backgroundImage = image ? `linear-gradient(${dark ? 'rgba(0,0,0,.45),rgba(0,0,0,.45)' : 'rgba(255,255,255,.5),rgba(255,255,255,.5)'}),${backgroundImage(image)}` : 'none';
}

function closeMenu() {
  document.querySelector('.navbar-burger').classList.remove('is-active');
  document.querySelector('.navbar-burger').setAttribute('aria-expanded', 'false');
  document.querySelector('.navbar-menu').classList.remove('is-active');
  document.getElementById('language-dropdown').classList.remove('is-active');
}

function navigate(page) {
  if (!multi) return;
  const url = new URL(location.href);
  url.searchParams.set('page', page);
  history.pushState(null, '', url);
  closeMenu();
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNavigation(documents, copy) {
  const navigation = document.querySelector('.navbar-end');
  navigation.querySelectorAll(':scope > a[data-section]').forEach(el => el.remove());
  const dropdown = document.getElementById('language-dropdown');
  for (const section of visibleSections()) {
    const anchor = document.createElement('a');
    anchor.className = 'navbar-item';
    anchor.dataset.section = section.id;
    anchor.id = `navbar-${section.id}`;
    anchor.textContent = documents[section.id]?.nav_label || navigationLabels[section.dataSource || section.id]?.[language] || navigationLabels[section.dataSource || section.id]?.[meta.defaultLanguage] || section.id;
    anchor.href = multi ? `?page=${encodeURIComponent(section.id)}&lang=${language}` : `#${section.id}`;
    navigation.insertBefore(anchor, dropdown);
  }
  text('navbar-title', copy.navbar_title || copy.navbar_home || 'Home');
  text('lang-label', copy.language || 'Language');
  dropdown.hidden = meta.navbar?.showLanguageDropdown === false;
  const languages = document.getElementById('language-dropdown-menu');
  languages.replaceChildren();
  for (const lang of meta.availableLanguages) {
    const button = document.createElement('a');
    button.className = 'navbar-item';
    button.href = `?lang=${lang}`;
    button.dataset.language = lang;
    button.textContent = meta.languageLabels?.[lang] || lang;
    button.setAttribute('aria-current', String(lang === language));
    languages.appendChild(button);
  }
}

function renderSection(section, data, copy, renderer, placeholder) {
  const wrap = document.createElement('section');
  wrap.className = 'section';
  const container = document.createElement('div');
  container.className = multi ? 'mp-section' : 'container is-max-desktop';
  container.id = section.id;
  const title = document.createElement('h1');
  title.className = 'title is-3 section-heading';
  title.textContent = data?.title || section.id;
  title.id = `${section.id}-title`;
  const controls = document.createElement('div');
  controls.className = 'mp-controls'; controls.id = `${section.id}-controls`;
  const content = document.createElement('div');
  content.className = 'about-texts mp-list'; content.id = `${section.id}-content`;
  content.dataset.sectionIntro = data?.intro || '';
  const options = section[mode]?.options || {};
  content.dataset.layout = section[mode]?.layout || 'list';
  content.style.setProperty('--section-columns', Math.min(4, Math.max(1, Number(options.columns) || 2)));
  content.style.setProperty('--section-gap', { small: '.75rem', normal: '1.5rem', large: '2rem' }[options.gap] || '1.5rem');
  container.append(title, controls, content); wrap.appendChild(container); if (placeholder) placeholder.replaceWith(wrap); else root.appendChild(wrap);
  if (!data) {
    content.textContent = copy.content_unavailable || 'Content is temporarily unavailable. Please try again.';
    return;
  }
  if (section.id === 'about' || section.template === 'text') {
    for (const value of data.texts || data.paragraphs || []) {
      const p = document.createElement('p'); p.className = 'text-homepage-1'; p.innerHTML = value; content.appendChild(p);
    }
  } else {
    pageScope.add(mountList({ section, mode, data, container: content, controls, renderer, labels: { ...copy, ...data }, language }));
  }
}

async function renderPage() {
  const current = gate.begin();
  const requestedLanguage = language;
  const page = pageKey();
  root.setAttribute('aria-busy', 'true');
  document.getElementById('page-error')?.remove();
  try {
    const sections = visibleSections();
    const requestedSections = multi ? sections.filter(section => section.id === page) : sections;
    const sectionRequests = requestedSections.map(async section => {
      try { return await dataStore.content(section.dataSource || section.id, requestedLanguage); }
      catch (error) { console.error(error); return null; }
    });
    const showHero = (!multi || page === 'home') && meta.home?.showHero !== false;
    // Optional hero widgets do not gate the title, portrait or section content.
    const cards = showHero ? dataStore.content('cards', requestedLanguage, { optional: true }).then(data => data?.cards || []).catch(() => []) : [];
    const words = showHero && meta.home?.showWordCloud !== false ? dataStore.content('wordcloud', requestedLanguage, { optional: true }).then(data => data?.wordcloud || []).catch(() => []) : [];
    const copy = await dataStore.ui(requestedLanguage);
    if (!current()) return;
    pageScope.destroy(); pageScope = createScope();
    root.replaceChildren();
    renderNavigation({}, copy);
    text('footer-text', copy.footer);
    document.documentElement.lang = language === 'jp' ? 'ja' : language;
    document.title = copy.page_title || 'Joshua’s Homepage';
    const renderer = createSectionRenderer({ ...meta, emptyStates: localize(meta.emptyStates, language, meta.defaultLanguage) }, language);
    if (singleHero) singleHero.hidden = !showHero;
    if (showHero) {
      const hero = multi ? document.createElement('div') : singleHero;
      hero.className = 'container has-text-centered home-hero';
      if (multi) root.appendChild(hero);
      pageScope.add(mountHero(hero, { meta, copy, cards, words }));
    }
    applyBackground();
    if (multi && page !== 'home' && !requestedSections.length) {
      const message = document.createElement('p');
      message.className = 'empty-state'; message.textContent = copy.section_missing || 'This section is not available.';
      root.appendChild(message);
    }
    // Reserve document order, then commit each section as its data arrives.
    // A slow projects request must not hold back About, news or publications.
    const placeholders = requestedSections.map(section => {
      const slot = document.createElement('section');
      slot.className = 'section section-loading';
      slot.dataset.pendingSection = section.id;
      slot.id = section.id;
      slot.setAttribute('aria-busy', 'true');
      root.appendChild(slot);
      return slot;
    });
    await Promise.all(sectionRequests.map(async (request, index) => {
      const data = await request;
      if (!current()) return;
      const section = requestedSections[index];
      renderSection(section, data, copy, renderer, placeholders[index]);
      const label = document.getElementById(`navbar-${section.id}`);
      if (label && data?.nav_label) label.textContent = data.nav_label;
    }));
    if (!current()) return;
    if (!multi && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (error) {
    if (!current()) return;
    console.error(error);
    const status = document.createElement('div');
    status.id = 'page-error'; status.className = 'load-error'; status.setAttribute('role', 'alert');
    status.textContent = 'Unable to load the page. ';
    const retry = document.createElement('button'); retry.textContent = 'Retry';
    retry.onclick = renderPage; status.appendChild(retry); root.prepend(status);
  } finally { if (current()) root.removeAttribute('aria-busy'); }
}

function wireNavigation() {
  const nav = document.querySelector('nav');
  lifetime.on(nav, 'click', event => {
    const target = event.target.closest('a,button');
    if (!target) return;
    if (target.dataset.language) {
      event.preventDefault(); language = setLanguage(target.dataset.language, meta); renderPage(); return;
    }
    if (target.dataset.section) {
      if (multi) { event.preventDefault(); navigate(target.dataset.section); }
      else {
        // Materialize skipped sections before native anchor scrolling computes
        // the destination. Estimated offscreen heights otherwise land too early.
        root.classList.add('anchor-navigation');
        closeMenu();
      }
      return;
    }
    if (target.id === 'navbar-home') {
      event.preventDefault();
      if (multi) navigate('home'); else { history.replaceState(null, '', location.pathname + location.search); root.classList.remove('anchor-navigation'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }
    if (target.classList.contains('navbar-burger')) {
      event.preventDefault();
      const open = target.classList.toggle('is-active');
      target.setAttribute('aria-expanded', String(open));
      document.querySelector('.navbar-menu').classList.toggle('is-active', open);
    }
    if (target.id === 'navbar-language') {
      event.preventDefault(); document.getElementById('language-dropdown').classList.toggle('is-active');
    }
  });
  lifetime.on(document, 'click', event => { if (!nav.contains(event.target)) closeMenu(); });
  lifetime.on(document, 'keydown', event => { if (event.key === 'Escape') closeMenu(); });
  lifetime.on(window, 'resize', closeMenu);
  lifetime.on(window, 'popstate', () => { language = getLanguage(meta); renderPage(); });
  lifetime.on(window, 'hashchange', applyBackground);
  const layout = document.getElementById('layout-mode-toggle');
  layout.title = multi ? 'Switch to single-page mode' : 'Switch to multi-page mode';
  layout.innerHTML = `<i class="fas fa-${multi ? 'file-alt' : 'layer-group'}"></i>`;
  lifetime.on(layout, 'click', event => {
    event.preventDefault(); storage.set('layoutMode', multi ? 'single' : 'multi');
    location.href = siteURL(multi ? `index.html?lang=${language}#${pageKey() === 'home' ? '' : pageKey()}` : `multipage_index.html?page=${encodeURIComponent(pageKey())}&lang=${language}`);
  });
  const top = document.getElementById('back-to-top');
  lifetime.on(window, 'scroll', () => top.classList.toggle('show', window.scrollY > 300), { passive: true });
  lifetime.on(top, 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function start() {
  try {
    meta = await dataStore.meta();
    attachServiceWarmup(meta, lifetime);
    language = setLanguage(getLanguage(meta), meta);
    wireNavigation();
    theme = initTheme(document.getElementById('dark-mode-toggle-mobile'), { onChange: applyBackground });
    for (const [name, color] of Object.entries(meta.themes || {})) document.documentElement.style.setProperty(`--site-${name}`, color);
    const rendering = renderPage();
    if (meta.add_diviner !== false) {
      try {
        const { initDiviner } = await import('../divine.js');
        diviner = initDiviner(meta);
      } catch (error) { console.warn('Optional diviner unavailable:', error); }
    }
    await rendering;
  } catch (error) {
    root.textContent = `Unable to start the page: ${error.message}`;
    root.setAttribute('role', 'alert');
  }
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  gate.begin(); // Invalidate pending section commits after leaving the page.
  pageScope.destroy(); lifetime.destroy(); theme?.destroy(); diviner?.destroy();
});
start();
