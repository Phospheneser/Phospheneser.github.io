# Academic homepage

A configuration-driven static academic website with shared rendering, multilingual content, extensible sections, and blog articles.

[中文文档与完整示例](README_ZH.md) · [Architecture and extension contracts](docs/architecture.md)

## Preview

```sh
python3 -m http.server 8000
```

Open `/index.html`, `/multipage_index.html?page=publications`, or `/blogs/index.html`. Add `lang=en`, `lang=zh`, or `lang=jp` to the query. Existing generated assets can be previewed directly. After editing images or navigation labels, run `npm ci && npm run build` before publishing. Serve over HTTP; do not open ES Modules using `file://`.

## One record, all languages

Append an item to `data/content/news.json`:

```json
{
  "id": "new-paper-2026",
  "date": "2026.11.13",
  "translations": {
    "en": { "content": "Our new paper is available." },
    "zh": { "content": "我们的新论文已发布。" }
  }
}
```

Shared dates, assets, and URLs are stored once. Missing translations fall back field-by-field to `meta.defaultLanguage`. Nested objects (including link labels) can carry their own translations. Explicit `null` omits a field; empty strings/arrays remain intentional. Item IDs must be stable and unique within a collection. List order is the default display order.

- `data/meta.json`: enabled sections, languages, template mappings, optional features.
- `data/content/*.json`: section metadata and `items`, with translations beside their content.
- `data/i18n/*.json`: UI copy.
- `blogs/posts/<slug>/<language>.html`: long-form article bodies. Missing bodies fall back to the default language without changing the visitor's preference.

To add a section, create a content document and register it in `meta.sections`. Reuse an existing `itemType`; no page edits are needed. Single-page and multi-page visibility, plugins, and layout are independent. Card grids use `layout: "grid"` and `options: { "columns": 2, "gap": "normal" }`.

Blog records need `id`, `slug`, `title`, `post_time`, and `summary`. Optional `body` points to an HTML file relative to the site root. Legacy `hero_image` paths remain relative to `blogs/`; ordinary images/link icons are relative to the site root. Article assets and scripts resolve relative to the actual body file, including fallback bodies. Only trusted repository-authored HTML is supported.

## Development checks

Node.js 22.15+ is needed for development checks, not to serve the site.

```sh
npm ci
npm run build
```

Checks cover content integrity, extension references, fallback, caching, stale-render guards, DOM navigation, filters, and component cleanup. `npm run verify:migration` is an optional one-time audit against the pre-refactor `f5cce8c` content. It is excluded from CI so normal future content edits are not blocked by old snapshots.

## Deployment

GitHub Pages continues serving the same static entry points; `.nojekyll` avoids unnecessary processing. The validation workflow does not change the deployment source. The optional Python diviner under `static/python/diviner/` remains a separately hosted service configured by `divine.serverUrl`. It is loaded only when enabled, after configuration is ready.

The asset build creates responsive WebP copies and navigation labels from existing source files. Commit `media/optimized/`, `static/js/generated/`, `static/css/generated/`, and updated HTML alongside content changes for branch-based Pages deployment. Original images remain untouched. `npm run check` runs checks without regenerating assets. Local desktop/mobile rendering has been checked; production Web Vitals still need measurement.


## Edit homepage selections locally

Run `npm run edit`, then open `http://127.0.0.1:8765/multipage_index.html?page=publications&lang=en&edit=1`. Pin/unpin works, drag the left-hand grip to reorder, and save. Up/down buttons remain available; Escape cancels a drag. Use the News, Projects or Blog navigation link to edit those sections. Each homepage section shows all pinned works (zero or more) and a count-free link to its complete list.

Saving updates only local JSON; commit and publish as usual to share the change. The editing server binds to loopback, uses same-origin checks and a per-session write token, and detects conflicting file changes. Visitors need no login. `npm run dev` runs the same uncached preview with editing disabled. You can also set the shared item field `featuredOrder` manually; homepage cards retain the full description, authors, dates and links.
