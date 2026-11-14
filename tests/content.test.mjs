import test from 'node:test';
import assert from 'node:assert/strict';
import { localize, resolveDocument, normalizeLanguage, selectItems } from '../static/js/core/content.js';
import { createDataStore, createRenderGate } from '../static/js/core/data.js';
import { validateSite } from '../scripts/validate-content.mjs';

test('a single new item renders in every locale with per-field fallback', () => {
  const doc = { items: [{ id: 'new-paper', date: '2026-11-13', links: [{ url: 'https://example.com', translations: { en: { label: 'Paper' }, zh: { label: '论文' } } }], translations: { en: { title: 'New paper', description: 'Details' }, zh: { title: '新论文' } } }] };
  const zh = resolveDocument(doc, 'papers', 'zh').papers[0];
  assert.equal(zh.title, '新论文'); assert.equal(zh.description, 'Details'); assert.equal(zh.links[0].label, '论文');
  assert.equal(resolveDocument(doc, 'papers', 'jp').papers[0].title, 'New paper');
  assert.deepEqual(doc.items[0].translations.zh, { title: '新论文' });
  assert.equal(localize({ translations: { en: { image: 'a.jpg' }, zh: { image: null } } }, 'zh').image, undefined);
});

test('unsupported languages use the configured default', () => {
  assert.equal(normalizeLanguage('../../x', { availableLanguages: ['zh', 'en'], defaultLanguage: 'zh' }), 'zh');
});

test('data requests are deduplicated across navigation and locale changes; failures are retryable', async () => {
  const calls = [];
  let fail = true;
  const store = createDataStore(async url => {
    calls.push(url);
    if (url.endsWith('meta.json')) return { ok: true, json: async () => ({ defaultLanguage: 'en', availableLanguages: ['en', 'zh'] }) };
    if (fail) { fail = false; return { ok: false, status: 503 }; }
    return { ok: true, json: async () => ({ items: [{ id: 'a', translations: { en: { title: 'A' }, zh: { title: '甲' } } }] }) };
  });
  await assert.rejects(store.content('news', 'en'), /503/);
  const [en, zh] = await Promise.all([store.content('news', 'en'), store.content('news', 'zh')]);
  assert.equal(en.news[0].title, 'A'); assert.equal(zh.news[0].title, '甲');
  assert.equal(calls.filter(url => url.endsWith('meta.json')).length, 1);
  assert.equal(calls.filter(url => url.endsWith('news.json')).length, 2);
});

test('late responses cannot commit after newer navigation', () => {
  const gate = createRenderGate(); const old = gate.begin(); const latest = gate.begin();
  assert.equal(old(), false); assert.equal(latest(), true);
});

test('search and sort compose without changing source order, including reset', () => {
  const items = [{ title: 'Paper B', date: '2026.2.1' }, { title: 'Paper A', date: '2026.11.1' }, { title: 'Other', post_time: '2026-12-01' }];
  assert.deepEqual(selectItems(items, { search: 'paper', sort: 'date-desc' }).map(x => x.title), ['Paper A', 'Paper B']);
  assert.deepEqual(selectItems(items, { search: 'paper' }).map(x => x.title), ['Paper B', 'Paper A']);
  assert.equal(items[0].title, 'Paper B');
});

test('repository content validates', async () => assert.deepEqual(await validateSite(), []));

test('featured selection is explicit, ordered, unlimited and does not mutate full lists', async () => {
  const { selectFeatured } = await import('../static/js/core/content.js');
  const items = [{ id: 'a', featuredOrder: 3 }, { id: 'b' }, { id: 'c', featuredOrder: 1 }, { id: 'd', featuredOrder: 2 }, { id: 'e', featuredOrder: 4 }, { id: 'invalid', featuredOrder: -1 }];
  assert.deepEqual(selectFeatured(items).map(item => item.id), ['c', 'd', 'a', 'e']);
  assert.deepEqual(selectFeatured([{ id: 'new' }]), []);
  assert.equal(items[0].id, 'a');
  assert.equal(items.length, 6);
});


test('card dates normalize padding and separators without inventing precision', async () => {
  const { formatContentDate } = await import('../static/js/core/content.js');
  assert.equal(formatContentDate('2025.9-2025.10'), '2025.09 – 2025.10');
  assert.equal(formatContentDate('2025-10-07 01:13'), '2025.10.07 01:13');
  assert.equal(formatContentDate('2026.8.9'), '2026.08.09');
  assert.equal(formatContentDate('2026'), '2026');
  assert.equal(formatContentDate(null), '');
});

test('publication locales explicitly translate titles and preserve every link action', async () => {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../data/content/publications.json', import.meta.url)));
  for (const item of data.items) {
    const en = localize(item, 'en');
    for (const lang of ['en', 'zh', 'jp']) {
      assert.ok(item.translations?.[lang]?.title, `${item.id}: missing explicit ${lang} title`);
      const translated = localize(item, lang);
      assert.equal(translated.links.length, en.links.length, `${item.id}/${lang}: missing link action`);
      assert.deepEqual(translated.links.map(link => link.icon), en.links.map(link => link.icon), `${item.id}/${lang}: inconsistent action order`);
    }
  }
});
