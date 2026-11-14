import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDocument } from '../static/js/core/content.js';
import { TemplateRegistry } from '../static/js/templates.js';
import { PluginRegistry } from '../static/js/plugins.js';
import '../static/js/extensions.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const builtinTemplates = new Set(['default', 'text', 'paper-card', 'meta-card', 'feature-card', 'card', 'timeline', 'list-inline']);
export async function validateSite(root = project) {
  const errors = [];
  const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const meta = await read('data/meta.json');
  const languages = meta.availableLanguages || [];
  if (!languages.length || !languages.includes(meta.defaultLanguage)) errors.push('defaultLanguage must be in availableLanguages');
  if (new Set(languages).size !== languages.length) errors.push('Duplicate availableLanguages');
  const names = new Set();
  function checkTranslations(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.translations) {
      if (Array.isArray(value.translations) || typeof value.translations !== 'object') errors.push(`${path}: translations must be an object`);
      for (const [lang, fields] of Object.entries(value.translations)) {
        if (!languages.includes(lang)) errors.push(`${path}: unsupported translation ${lang}`);
        if (!fields || Array.isArray(fields) || typeof fields !== 'object') errors.push(`${path}: ${lang} translation must contain fields`);
        if (fields && ('id' in fields || 'slug' in fields)) errors.push(`${path}: IDs and slugs must be shared`);
      }
    }
    for (const [key, child] of Object.entries(value)) checkTranslations(child, `${path}.${key}`);
  }
  for (const lang of languages) {
    try { await read(`data/i18n/${lang}.json`); } catch (error) { errors.push(`${lang}: ${error.message}`); }
  }
  const documents = new Map();
  for (const name of await readdir(resolve(root, 'data/content'))) {
    if (!name.endsWith('.json')) continue;
    try {
      const data = await read(`data/content/${name}`);
      documents.set(name.slice(0, -5), data);
      checkTranslations(data, name);
      if (data.items !== undefined && !Array.isArray(data.items)) errors.push(`${name}: items must be an array`);
      const ids = new Set();
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(item.id)) errors.push(`${name}: each item needs a stable id`);
        if (ids.has(item.id)) errors.push(`${name}: duplicate id ${item.id}`);
        ids.add(item.id);
      }
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  for (const section of meta.sections || []) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(section.id) || names.has(section.id)) errors.push(`Invalid or duplicate section ID: ${section.id}`);
    names.add(section.id);
    const source = section.dataSource || section.id;
    const document = documents.get(source);
    if (!document) { errors.push(`${section.id}: missing data/content/${source}.json`); continue; }
    const type = meta.itemTypes?.[section.itemType];
    if (section.itemType && !type) errors.push(`${section.id}: unknown itemType ${section.itemType}`);
    const template = section.template || type?.template || 'default';
    if (!builtinTemplates.has(template) && !TemplateRegistry.get(template)) errors.push(`${section.id}: unknown template ${template}`);
    for (const mode of ['singlePage', 'multiPage']) {
      for (const plugin of section[mode]?.plugins || []) if (!PluginRegistry.get(plugin)) errors.push(`${section.id}: unknown plugin ${plugin}`);
    }
    for (const lang of languages) {
      const data = resolveDocument(document, source, lang, meta.defaultLanguage);
      if (!data.title) errors.push(`${section.id}/${lang}: missing title`);
      for (const item of data[source] || []) {
        for (const key of type?.requiredKeys || []) {
          if (item[key] === undefined || item[key] === null || item[key] === '') errors.push(`${section.id}/${lang}/${item.id}: missing ${key}`);
        }
      }
    }
  }
  const slugs = new Set();
  for (const post of documents.get('blogs')?.items || []) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(post.slug || '') || slugs.has(post.slug)) errors.push(`Invalid or duplicate blog slug: ${post.slug}`);
    slugs.add(post.slug);
    try {
      const resolved = resolveDocument({ items: [post] }, 'blogs', meta.defaultLanguage, meta.defaultLanguage).blogs[0];
      const body = resolved.body || `blogs/posts/${post.slug}/${meta.defaultLanguage}.html`;
      if (resolve(root, body).startsWith(resolve(root) + '/')) await readFile(resolve(root, body));
      else errors.push(`Blog body must stay inside the repository: ${body}`);
    } catch { errors.push(`Missing default-language body for ${post.slug}`); }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = await validateSite();
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Content valid: locale fallback, stable IDs, required fields, section/plugin/template references and blog bodies.');
  } catch (error) { console.error(error); process.exitCode = 1; }
}
