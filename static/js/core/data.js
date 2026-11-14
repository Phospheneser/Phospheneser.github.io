import { normalizeLanguage, resolveDocument } from './content.js';

// Relative to this module, so project GitHub Pages and nested blog URLs work too.
export const siteRoot = new URL('../../../', import.meta.url);
export const siteURL = path => new URL(path, siteRoot).href;

export function createDataStore(fetcher = (...args) => fetch(...args)) {
  const cache = new Map();
  function json(path, optional = false) {
    const url = siteURL(path);
    if (!cache.has(url)) {
      const pending = fetcher(url).then(async response => {
        if (response.status === 404 && optional) return null;
        if (!response.ok) throw new Error(`Unable to load ${path} (HTTP ${response.status})`);
        return response.json();
      }).catch(error => { cache.delete(url); throw error; });
      cache.set(url, pending);
    }
    return cache.get(url);
  }
  const meta = () => json('data/meta.json');
  async function content(source, language, { optional = false } = {}) {
    if (!/^[a-zA-Z0-9_-]+$/.test(source)) throw new Error('Invalid content source');
    const config = await meta();
    const document = await json(`data/content/${source}.json`, optional);
    return document ? resolveDocument(document, source, normalizeLanguage(language, config), config.defaultLanguage) : null;
  }
  async function ui(language) {
    const config = await meta();
    const lang = normalizeLanguage(language, config);
    const [fallback, selected] = await Promise.all([
      json(`data/i18n/${config.defaultLanguage}.json`),
      lang === config.defaultLanguage ? null : json(`data/i18n/${lang}.json`, true)
    ]);
    return { ...fallback, ...selected };
  }
  return { meta, content, ui, clear: () => cache.clear() };
}

export const dataStore = createDataStore();

// Guard the commit, not the shared cached request: old responses cannot repaint a new route.
export function createRenderGate() {
  let version = 0;
  return { begin() { const ticket = ++version; return () => ticket === version; } };
}
