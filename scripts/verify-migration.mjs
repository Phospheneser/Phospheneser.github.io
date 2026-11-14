// One-time migration audit against the pre-refactor commit f5cce8c.
// Not part of CI: adding or editing content after migration is expected.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveDocument } from '../static/js/core/content.js';
const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const hashes = await read('tests/fixtures/legacy-content-sha256.json');
  for (const [key, expected] of Object.entries(hashes)) {
    const [lang, source] = key.split('/');
    let document;
    if (source === 'web_content') document = await read(`data/i18n/${lang}.json`);
    else {
      document = resolveDocument(await read(`data/content/${source}.json`), source, lang);
      if (Array.isArray(document[source])) document[source] = document[source].map(({ id, ...item }) => {
        // These visitor settings were moved from the template's hardcoded HTML.
        if (source === 'visitors') { delete item.url; delete item.image; }
        return item;
      });
    }
    const actual = createHash('sha256').update(JSON.stringify(canonical(document))).digest('hex');
    assert.equal(actual, expected, key);
  }
console.log('Verified all 33 original locale documents against f5cce8c.');
