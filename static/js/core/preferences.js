import { normalizeLanguage } from './content.js';

export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private storage can be unavailable. */ } }
};

export function getLanguage(meta) {
  return normalizeLanguage(new URLSearchParams(location.search).get('lang') || storage.get('lang'), meta);
}

export function setLanguage(language, meta) {
  const lang = normalizeLanguage(language, meta);
  storage.set('lang', lang);
  document.documentElement.lang = lang === 'jp' ? 'ja' : lang;
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  return lang;
}

export function initTheme(button, { labels = () => ({}), onChange = () => {} } = {}) {
  const stored = storage.get('darkMode');
  let dark = stored === null ? matchMedia('(prefers-color-scheme: dark)').matches : stored === 'true';
  function update() {
    document.body.classList.toggle('dark-mode', dark);
    if (button) {
      button.innerHTML = `<i class="fas fa-${dark ? 'sun' : 'moon'}"></i>`;
      const copy = labels();
      button.title = dark ? (copy.darkToLight || 'Switch to light mode') : (copy.lightToDark || 'Switch to dark mode');
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(dark));
    }
    onChange(dark);
  }
  const toggle = event => { event.preventDefault(); dark = !dark; storage.set('darkMode', String(dark)); update(); };
  button?.addEventListener('click', toggle);
  update();
  return { update, destroy: () => button?.removeEventListener('click', toggle) };
}
