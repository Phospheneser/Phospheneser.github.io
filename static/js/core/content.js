// Pure content helpers: shared by the browser, validation, and tests.
export function localize(value, language, fallback = 'en') {
  if (Array.isArray(value)) return value.map(item => localize(item, language, fallback));
  if (!value || typeof value !== 'object') return value;
  const { translations = {}, ...shared } = value;
  const merged = { ...shared, ...translations[fallback], ...translations[language] };
  return Object.fromEntries(Object.entries(merged)
    .filter(([, field]) => field !== null)
    .map(([key, field]) => [key, localize(field, language, fallback)]));
}

export function normalizeLanguage(language, meta) {
  return meta.availableLanguages.includes(language) ? language : meta.defaultLanguage;
}

// Explicit pins only: adding a new item must not silently replace a selection.
export function selectFeatured(items) {
  return items.filter(item => Number.isInteger(item.featuredOrder) && item.featuredOrder > 0)
    .sort((a, b) => a.featuredOrder - b.featuredOrder);
}

export function resolveDocument(document, source, language, fallback = 'en') {
  const result = localize(document, language, fallback);
  if (Array.isArray(result.items)) {
    result[source] = result.items;
    delete result.items;
  }
  return result;
}

export function selectItems(items, { search = '', sort = '', language = 'en' } = {}) {
  const needle = search.trim().toLocaleLowerCase();
  const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '') :
    Array.isArray(value) ? value.map(text).join(' ') :
    value && typeof value === 'object' ? Object.values(value).map(text).join(' ') : String(value ?? '');
  const result = items.filter(item => !needle || text(item).toLocaleLowerCase().includes(needle));
  const dateValue = item => {
    const raw = String(item.date || item.post_time || '');
    const match = raw.match(/(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?/);
    return match ? Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3] || 1) : /^\d{4}$/.test(raw) ? Number(raw) * 10000 : 0;
  };
  const locale = language === 'jp' ? 'ja' : language;
  if (sort.startsWith('date-')) result.sort((a, b) => (dateValue(a) - dateValue(b)) * (sort === 'date-desc' ? -1 : 1));
  if (sort.startsWith('title-')) result.sort((a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), locale) * (sort === 'title-desc' ? -1 : 1));
  return result;
}


// Preserve known precision; format date-only values without timezone conversion.
export function formatContentDate(value) {
  const raw = String(value ?? '').trim();
  return raw.replace(/(\d{4})[.\/-](\d{1,2})(?!\d)(?:[.\/-](\d{1,2})(?!\d))?/g,
    (_, year, month, day) => `${year}.${month.padStart(2, '0')}${day ? '.' + day.padStart(2, '0') : ''}`)
    .replace(/(\d)\s*[-–—]\s*(?=\d{4}\.)/g, '$1 – ');
}
