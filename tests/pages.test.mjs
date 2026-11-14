import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM, ResourceLoader } from 'jsdom';
import { registerHooks } from 'node:module';
// jsdom provides the DOM; Node executes ESM. Give the data module the URL it
// would have under a GitHub project site so URL behavior is tested faithfully.
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url.endsWith('/static/js/core/data.js')) return { ...result, source: String(result.source).replace("new URL('../../../', import.meta.url)", "new URL('http://localhost/project/')") };
  return result;
} });
const { dataStore } = await import('../static/js/core/data.js');
const { mountCarousel, mountHero } = await import('../static/js/components/hero.js');
const { TemplateRegistry } = await import('../static/js/templates.js');
const { createSectionRenderer } = await import('../static/js/renderers/sections.js');
const { initDiviner } = await import('../static/js/divine.js');

let sequence = 0;
const repo = new URL('../', import.meta.url);
const featuredCounts = Object.fromEntries(await Promise.all(['publications', 'projects', 'blogs'].map(async source => [source, JSON.parse(await readFile(new URL(`data/content/${source}.json`, repo))).items.filter(item => Number.isInteger(item.featuredOrder) && item.featuredOrder > 0).length])));
const newsCount = JSON.parse(await readFile(new URL('data/content/news.json', repo))).items.length;
const publicationCount = JSON.parse(await readFile(new URL('data/content/publications.json', repo))).items.length;
async function setup(page, search = '', options = {}) {
  const html = await readFile(new URL(page, repo), 'utf8');
  class ArticleResources extends ResourceLoader {
    fetch(url) {
      const pending = url.endsWith('/kana-chart.js')
        ? readFile(new URL('blogs/posts/learning-the-japanese-kana/kana-chart.js', repo))
        : Promise.resolve(Buffer.from(''));
      pending.abort = () => {}; // ResourceLoader requests expose abort() during window.close().
      return pending;
    }
  }
  const dom = new JSDOM(html, { url: `http://localhost/project/${page}${search}`, pretendToBeVisual: true,
    ...(options.scripts ? { runScripts: 'dangerously', resources: new ArticleResources() } : {}) });
  const requests = [];
  const intervals = new Map();
  let timer = 0;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.matchMedia = media;
  dom.window.TagCanvas = { Start() {}, Delete() {}, Pause() {} };
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'localStorage', 'location', 'history', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.matchMedia = media;
  globalThis.setInterval = callback => { const id = ++timer; intervals.set(id, callback); return id; };
  globalThis.clearInterval = id => intervals.delete(id);
  globalThis.fetch = async url => {
    url = String(url); requests.push(url);
    await options.beforeFetch?.(url);
    const supplied = await options.response?.(url);
    if (supplied) return supplied;
    let pathname;
    if (url.startsWith('file:')) pathname = fileURLToPath(url);
    else {
      const parsed = new URL(url, dom.window.location.href);
      pathname = fileURLToPath(new URL(parsed.pathname.replace(/^\/project\//, ''), repo));
    }
    try {
      if (options.missing?.(pathname)) return { ok: false, status: 404 };
      const raw = await readFile(pathname, 'utf8');
      return { ok: true, status: 200, text: async () => raw, json: async () => {
        const value = JSON.parse(raw);
        if (pathname.endsWith('/data/meta.json')) { value.add_diviner = false; options.meta?.(value); }
        return value;
      } };
    } catch { return { ok: false, status: 404 }; }
  };
  dataStore.clear();
  return { dom, requests, intervals, cleanup() {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close(); intervals.clear();
  } };
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('DOM state did not settle');
}
async function load(entry) { await import(new URL(`../static/js/pages/${entry}.js?test=${++sequence}`, import.meta.url)); }
const click = element => {
  assert.ok(element, 'click target exists');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

test('single-page home preserves all sections in three languages and cleans up widgets', async () => {
  const env = await setup('index.html', '?lang=en');
  try {
    await load('home');
    await until(() => document.querySelector('#blogs .section-more-link') && !document.getElementById('meta-sections-root').hasAttribute('aria-busy'));
    assert.equal(document.querySelectorAll('#publications-content .meta-card').length, featuredCounts.publications);
    assert.equal(document.querySelectorAll('#projects-content .meta-card').length, featuredCounts.projects);
    assert.equal(document.querySelectorAll('#blogs-content .meta-card').length, featuredCounts.blogs);
    assert.equal(document.querySelectorAll('.experience-item').length, 8);
    assert.equal(env.intervals.size, 1);
    assert.equal(env.requests.some(url => url.endsWith('/health')), false, 'disabled diviner never prewarms');
    for (const lang of ['zh', 'jp', 'en', 'zh']) {
      click(document.querySelector(`[data-language="${lang}"]`));
      await until(() => !document.getElementById('meta-sections-root').hasAttribute('aria-busy'));
      assert.equal(document.documentElement.lang, lang === 'jp' ? 'ja' : lang);
      assert.equal(document.querySelectorAll('#publications-content .meta-card').length, featuredCounts.publications);
      assert.equal(env.intervals.size, 1, 'only one live carousel interval');
      if (featuredCounts.blogs) assert.equal(document.querySelector('#blogs-content a.blog-card-title').href.includes(`lang=${lang}`), true);
    }
    const jsonRequests = env.requests.filter(url => url.includes('/data/content/'));
    assert.equal(jsonRequests.length, new Set(jsonRequests).size, 'locale switches reuse content documents');
    click(document.querySelector('[data-section=projects]'));
    assert.ok(document.getElementById('meta-sections-root').classList.contains('anchor-navigation'));
    click(document.getElementById('navbar-home'));
    assert.ok(!document.getElementById('meta-sections-root').classList.contains('anchor-navigation'));
    click(document.getElementById('dark-mode-toggle-mobile'));
    assert.equal(document.body.classList.contains('dark-mode'), true);
    click(document.querySelector('.navbar-burger'));
    assert.equal(document.querySelector('.navbar-burger').getAttribute('aria-expanded'), 'true');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.querySelector('.navbar-burger').getAttribute('aria-expanded'), 'false');
    env.dom.window.dispatchEvent(new env.dom.window.Event('pagehide'));
    assert.equal(env.intervals.size, 0);
  } finally { env.cleanup(); }
});

test('slow section requests do not delay the hero or language controls', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const env = await setup('index.html', '?lang=en', {
    beforeFetch: url => url.endsWith('/projects.json') ? blocked : undefined
  });
  try {
    await load('home');
    await until(() => document.querySelector('.home-hero .card.active'));
    assert.equal(document.querySelectorAll('[data-language]').length, 3);
    assert.equal(document.getElementById('meta-sections-root').getAttribute('aria-busy'), 'true');
    assert.equal(document.getElementById('projects-content'), null);
    assert.ok(document.getElementById('projects'), 'pending sections reserve an anchor target');
    await until(() => document.getElementById('about-content')?.textContent.length > 100);
    assert.ok(document.querySelector('#publications-content .meta-card'), 'other sections render before projects resolves');
    release();
    await until(() => !document.getElementById('meta-sections-root').hasAttribute('aria-busy'));
    assert.equal(document.querySelectorAll('#projects-content .meta-card').length, featuredCounts.projects);
  } finally { release(); env.cleanup(); }
});

test('optional word cloud loads only when visible and pauses offscreen, hidden, or with reduced motion', async () => {
  const env = await setup('index.html');
  const observers = [];
  const calls = [];
  const motion = new window.EventTarget(); motion.matches = false;
  window.matchMedia = () => motion;
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
    visible(value) { this.callback([{ isIntersecting: value }]); }
  };
  window.TagCanvas = Object.fromEntries(['Start', 'Pause', 'Resume', 'Delete'].map(name => [name, () => calls.push(name)]));
  const root = document.createElement('div'); document.body.appendChild(root);
  let dispose;
  try {
    dispose = mountHero(root, { meta: {}, copy: {}, words: [{ text: 'Research' }] });
    assert.deepEqual(calls, []);
    const cloud = observers.find(observer => observer.element.classList.contains('mp-home-cloud'));
    cloud.visible(true);
    await until(() => calls.includes('Start'));
    cloud.visible(false); assert.equal(calls.at(-1), 'Pause');
    cloud.visible(true); assert.equal(calls.at(-1), 'Resume');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new window.Event('visibilitychange')); assert.equal(calls.at(-1), 'Pause');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new window.Event('visibilitychange')); assert.equal(calls.at(-1), 'Resume');
    motion.matches = true; motion.dispatchEvent(new window.Event('change'));
    assert.equal(calls.at(-1), 'Pause');
    dispose(); dispose = null;
    assert.equal(calls.at(-1), 'Delete');
    assert.ok(observers.every(observer => observer.disconnected));
    const count = calls.length;
    document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(calls.length, count, 'disposed widgets have no active listeners');
    dispose = mountHero(root, { meta: {}, copy: {}, words: [{ text: 'Research' }] });
    observers.at(-1).visible(true);
    await Promise.resolve();
    assert.equal(calls.length, count, 'reduced motion never starts the canvas');
    assert.ok(root.querySelector('.cloud-unavailable #tags').textContent.includes('Research'));
  } finally { dispose?.(); env.cleanup(); }
});

test('a multipage route does not wait for unrelated section data', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const env = await setup('multipage_index.html', '?page=publications&lang=en', {
    beforeFetch: url => url.endsWith('/projects.json') ? blocked : undefined
  });
  try {
    await load('home');
    await until(() => document.querySelectorAll('#publications-content .meta-card').length === publicationCount);
    assert.equal(document.getElementById('content-root').hasAttribute('aria-busy'), false);
    assert.equal(document.querySelector('#navbar-projects').textContent, 'Projects');
    assert.deepEqual(env.requests.filter(url => url.includes('/data/content/')).map(url => url.split('/').at(-1)), ['publications.json']);
    click(document.querySelector('[data-section=projects]'));
    await until(() => env.requests.some(url => url.endsWith('/projects.json')));
    release();
    await until(() => document.querySelectorAll('#projects-content .meta-card').length === 6);
  } finally { release(); env.cleanup(); }
});

test('math runtime is requested asynchronously only for articles that need it', async () => {
  const env = await setup('blogs/post.html');
  const { typesetArticle } = await import('../static/js/core/math.js');
  const container = document.getElementById('post-content');
  try {
    container.textContent = 'A plain article without equations.';
    await typesetArticle(container);
    assert.equal(document.querySelector('script[src*="mathjax"]'), null);
    container.textContent = 'An equation: $x^2$.';
    const pending = typesetArticle(container);
    const script = document.querySelector('script[src*="mathjax"]');
    assert.ok(script); assert.equal(script.async, true);
    let typeset = false;
    window.MathJax = { startup: { promise: Promise.resolve() }, typesetPromise: async nodes => {
      assert.deepEqual(nodes, [container]); typeset = true;
    } };
    script.onload();
    await pending;
    assert.equal(typeset, true);
    typeset = false;
    await typesetArticle(container, false);
    assert.equal(typeset, false, 'explicit opt-out bypasses math rendering');
  } finally { env.cleanup(); }
});

test('all pages use complete local icon fonts without the full icon runtime or remote font CSS', async () => {
  const css = await readFile(new URL('static/css/fontawesome.all.min.css', repo), 'utf8');
  const dom = new JSDOM(`<style>${css}</style>`);
  try {
    const faces = [...dom.window.document.styleSheets[0].cssRules].filter(rule => rule.type === 5);
    assert.equal(faces.length, 3);
    assert.equal(new Set(faces.map(rule => rule.style.getPropertyValue('font-family'))).size, 2);
    for (const rule of faces) {
      const src = rule.style.getPropertyValue('src');
      const name = src.match(/\.\.\/webfonts\/([^"']+\.woff2)/)?.[1];
      assert.ok(name, src);
      assert.equal((await readFile(new URL(`static/webfonts/${name}`, repo))).subarray(0, 4).toString(), 'wOF2');
    }
    for (const page of ['index.html', 'multipage_index.html', 'blogs/index.html', 'blogs/post.html']) {
      const html = await readFile(new URL(page, repo), 'utf8');
      assert.ok(html.includes('fontawesome.all.min.css'), page);
      assert.ok(!/fontawesome\.all\.min\.js|fonts\.googleapis\.com|academicons/.test(html), page);
    }
  } finally { dom.window.close(); }
});

test('multi-page routes, back navigation, search/sort and optional visibility', async () => {
  const env = await setup('multipage_index.html', '?page=publications&lang=jp');
  try {
    await load('home');
    await until(() => document.querySelectorAll('#publications-content .meta-card').length === publicationCount);
    const titles = () => [...document.querySelectorAll('#publications-content .meta-card-title')].map(el => el.textContent);
    const original = titles();
    const input = document.querySelector('.meta-search'); input.value = 'MOSS Transcribe'; input.dispatchEvent(new window.Event('input'));
    assert.equal(titles().length, 1);
    const select = document.querySelector('.meta-sort'); select.value = 'title-asc'; select.dispatchEvent(new window.Event('change'));
    assert.equal(titles().length, 1);
    input.value = ''; input.dispatchEvent(new window.Event('input'));
    select.value = ''; select.dispatchEvent(new window.Event('change'));
    assert.deepEqual(titles(), original);
    click(document.querySelector('[data-section="members"]'));
    await until(() => document.querySelectorAll('.member-card').length === 2);
    assert.equal(env.intervals.size, 0);
    click(document.getElementById('navbar-home'));
    await until(() => env.intervals.size === 1);
    click(document.querySelector('[data-section="news"]'));
    await until(() => document.getElementById('news-content'));
    assert.equal(env.intervals.size, 0, 'leaving home destroys the carousel');
    history.replaceState(null, '', '?page=projects&lang=zh');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await until(() => document.querySelectorAll('#projects-content .meta-card').length === 6);
    assert.equal(document.documentElement.lang, 'zh');
  } finally { env.cleanup(); }
  const hidden = await setup('index.html', '?lang=en', { meta(config) {
    config.home.showHero = false; config.sections.find(section => section.id === 'news').singlePage.enabled = false;
    config.sections.push({ id: 'awards', dataSource: 'news', itemType: 'news', enabled: true, singlePage: { enabled: true, layout: 'grid', options: { columns: 2 } } });
  } });
  try {
    await load('home');
    await until(() => document.getElementById('publications-content'));
    assert.equal(document.getElementById('news'), null);
    assert.equal(document.getElementById('navbar-news'), null);
    assert.equal(document.querySelectorAll('#awards-content .section-text-block').length, newsCount);
    assert.equal(document.getElementById('awards-content').dataset.layout, 'grid');
    assert.equal(document.querySelector('.home-hero'), null);
    assert.equal(hidden.intervals.size, 0);
    assert.equal(document.getElementById('diviner-container'), null);
  } finally { hidden.cleanup(); }
});

test('blog list uses shared cards, localized URLs and composable tag/search filters', async () => {
  const env = await setup('blogs/index.html', '?lang=zh');
  try {
    await load('blog-index');
    assert.equal(document.querySelectorAll('#blog-post-list article').length, 3);
    const links = [...document.querySelectorAll('#blog-post-list .meta-card-title')];
    assert.ok(links.every(link => link.href.includes('blogs/post.html?') && link.href.includes('lang=zh')));
    assert.ok([...document.querySelectorAll('#blog-post-list img:not(.meta-link-icon)')].every(img => img.src.includes('/project/media/optimized/') && img.srcset.includes('640w')));
    document.getElementById('blog-search').value = '不存在的词';
    document.getElementById('blog-search').dispatchEvent(new window.Event('input'));
    assert.equal(document.querySelectorAll('#blog-post-list article').length, 0);
    click([...document.querySelectorAll('.blog-lang-button')].find(el => el.textContent === '日本語'));
    await until(() => !document.getElementById('blog-post-list').hasAttribute('aria-busy'));
    assert.equal(document.documentElement.lang, 'ja');
    assert.equal(document.querySelectorAll('#blog-post-list article').length, 3);
  } finally { env.cleanup(); }
});

test('article content, math callback and missing-slug state', async () => {
  const env = await setup('blogs/post.html', '?slug=Notes-on-Variational-Inference&lang=zh');
  let typeset = false;
  window.MathJax = { startup: { promise: Promise.resolve() }, typesetPromise: async () => { typeset = true; } };
  try {
    await load('blog-post');
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await until(() => document.getElementById('post-content').textContent.length > 100 && typeset);
    assert.equal(document.getElementById('post-wrapper').hidden, false);
    assert.equal(document.documentElement.lang, 'zh');
    assert.ok(document.getElementById('post-back-to-blog').href.includes('lang=zh'));
    assert.equal(document.querySelectorAll('#post-status button').length, 0);
  } finally { env.cleanup(); }
  const missing = await setup('blogs/post.html', '?slug=does-not-exist&lang=en');
  try {
    await load('blog-post'); document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await until(() => document.getElementById('post-status').textContent.length > 0);
    assert.equal(document.getElementById('post-wrapper').hidden, true);
  } finally { missing.cleanup(); }
});

test('new templates use the extension contract and duplicate registration is rejected', async () => {
  const env = await setup('index.html');
  try {
    TemplateRegistry.register('test-gallery', (items, section, container, context) => {
      container.textContent = `${context.language}:${items[0].title}`;
      return () => { container.dataset.cleaned = 'yes'; };
    });
    assert.throws(() => TemplateRegistry.register('test-gallery', () => {}), /already registered/);
    const container = document.createElement('div');
    const cleanup = createSectionRenderer({ itemTypes: {} }, 'zh').drawList([{ title: '照片' }], { id: 'gallery', template: 'test-gallery' }, container, {});
    assert.equal(container.textContent, 'zh:照片'); cleanup(); assert.equal(container.dataset.cleaned, 'yes');
  } finally { env.cleanup(); }
});

test('carousel cleanup removes old button handlers, and diviner honors explicit configuration', async () => {
  const env = await setup('index.html');
  try {
    const container = document.querySelector('.card-container');
    for (let i = 0; i < 3; i++) { const card = document.createElement('div'); card.className = 'card'; container.appendChild(card); }
    const cleanup = mountCarousel(container); cleanup();
    const cleanup2 = mountCarousel(container);
    click(container.querySelector('#next-btn'));
    assert.equal([...container.querySelectorAll('.card')].findIndex(card => card.classList.contains('active')), 1);
    assert.equal(env.intervals.size, 1); cleanup2(); assert.equal(env.intervals.size, 0);
    assert.equal(initDiviner({ add_diviner: false }), null);
    const widget = initDiviner({ add_diviner: true, divine: { serverUrl: 'https://example.com', prewarm: false } });
    assert.equal(widget.meta.divine.serverUrl, 'https://example.com');
    widget.openDivineWindow(); widget.closeDivineWindow(); widget.destroy();
    assert.equal(document.getElementById('diviner-container'), null);
  } finally { env.cleanup(); }
});

test('missing article translation falls back without changing locale preference', async () => {
  const env = await setup('blogs/post.html', '?slug=launching-the-research-blog&lang=jp', {
    missing: path => path.endsWith('/launching-the-research-blog/jp.html')
  });
  try {
    await load('blog-post'); document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await until(() => document.getElementById('post-content').textContent.length > 100);
    assert.equal(document.getElementById('post-content').lang, 'en');
    assert.equal(document.documentElement.lang, 'ja');
    assert.equal(localStorage.getItem('lang'), 'jp');
    assert.ok(document.getElementById('post-status').textContent.includes('en'));
  } finally { env.cleanup(); }
});

test('kana article executes its real script and resolves audio relative to the article', async () => {
  const env = await setup('blogs/post.html', '?slug=learning-the-japanese-kana&lang=jp', { scripts: true });
  let audioURL;
  window.HTMLMediaElement.prototype.play = function () { audioURL = this.src; return Promise.resolve(); };
  try {
    await load('blog-post'); document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await until(() => document.querySelector('.kana-card') && document.getElementById('post-content').dataset.loaded === 'true');
    const card = document.querySelector('.kana-card');
    click(card);
    assert.ok(audioURL.includes('/project/blogs/posts/learning-the-japanese-kana/media/audio/'));
    assert.ok(audioURL.endsWith('.mp3'));
    assert.equal(document.documentElement.lang, 'ja');
    assert.ok(window.__currentPostBaseURL.endsWith('/learning-the-japanese-kana/'));
  } finally { env.cleanup(); }
});

test('experience renderer preserves existing anchors and avoids nested generated links', async () => {
  const env = await setup('index.html');
  try {
    const container = document.createElement('div');
    TemplateRegistry.get('experience')([{ title: 'Research', org: '<a href="https://example.com">Lab</a>', content: ['[Paper](https://example.org/paper)', 'Demo: https://example.org/demo'] }], {}, container, {});
    assert.equal(container.querySelectorAll('a').length, 3);
    assert.equal(container.querySelector('a a'), null);
    assert.equal(container.querySelector('.exp-org').textContent, 'Lab');
  } finally { env.cleanup(); }
});

test('diviner deduplicates submissions and closing prevents old results overwriting a new panel', async () => {
  const env = await setup('index.html');
  const pending = [];
  globalThis.fetch = (url, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal }));
  const widget = initDiviner({ divine: { prewarm: false } });
  try {
    widget.openDivineWindow();
    const first = widget.startDivination();
    await widget.startDivination();
    assert.equal(pending.length, 1);
    assert.equal(document.getElementById('divine-submit').disabled, true);
    widget.closeDivineWindow();
    assert.equal(pending[0].signal.aborted, true);
    widget.openDivineWindow();
    const second = widget.startDivination();
    pending[1].resolve({ ok: true, text: async () => '{"success":true,"result":"new"}' });
    await second;
    pending[0].resolve({ ok: true, text: async () => '{"success":true,"result":"old"}' });
    await first;
    assert.equal(document.getElementById('divine-result').textContent, 'new');
    assert.equal(document.getElementById('divine-submit').disabled, false);
    document.getElementById('divine-query').value = ' ';
    await widget.startDivination();
    assert.equal(pending.length, 2, 'empty questions do not issue requests');
  } finally { widget.destroy(); env.cleanup(); }
});

test('diviner distinguishes a touch or mouse tap from dragging', async () => {
  const env = await setup('index.html');
  const widget = initDiviner({ divine: { prewarm: false } });
  const pointer = (type, x, y) => {
    const event = new window.Event(type);
    Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y });
    widget.container.dispatchEvent(event);
  };
  try {
    pointer('pointerdown', 10, 10); pointer('pointermove', 40, 40); pointer('pointerup', 40, 40);
    click(widget.container);
    assert.equal(widget.divineWindow, null, 'a drag does not open the panel');
    pointer('pointerdown', 40, 40); pointer('pointermove', 41, 41); pointer('pointerup', 41, 41);
    click(widget.container);
    assert.ok(widget.divineWindow, 'a small movement still counts as a tap');
  } finally { widget.destroy(); env.cleanup(); }
});

test('page-entry prewarming starts before slow sections and never blocks actual divination', async () => {
  let releaseSections, releaseHealth;
  const sections = new Promise(resolve => { releaseSections = resolve; });
  const health = new Promise(resolve => { releaseHealth = resolve; });
  const env = await setup('index.html', '?lang=zh', {
    meta: config => { config.add_diviner = true; config.divine = { serverUrl: 'https://warmup-home.example' }; },
    beforeFetch: url => url.endsWith('/projects.json') ? sections : undefined,
    response: url => {
      if (url.endsWith('/health')) return health;
      if (url.includes('/divine?')) return { ok: true, text: async () => '{"success":true,"result":"Live result"}' };
    }
  });
  try {
    await load('home');
    await until(() => env.requests.some(url => url.endsWith('/health')));
    await until(() => document.getElementById('projects'));
    assert.equal(document.getElementById('projects-content'), null);
    assert.ok(document.getElementById('projects'), 'pending sections reserve an anchor target');
    await until(() => document.getElementById('about-content')?.textContent.length > 100);
    assert.ok(document.querySelector('#publications-content .meta-card'), 'other sections render before projects resolves');
    releaseSections();
    await until(() => document.getElementById('diviner-container'));
    click(document.getElementById('diviner-container'));
    assert.ok(document.getElementById('divine-service-status').textContent.includes('唤醒'));
    assert.equal(env.requests.filter(url => url.endsWith('/health')).length, 1, 'opening panel reuses page-entry probe');
    click(document.getElementById('divine-submit'));
    await until(() => document.getElementById('divine-result').textContent === 'Live result');
    assert.equal(document.getElementById('divine-service-status').textContent, '占卜服务已就绪');
    releaseHealth({ ok: false });
    click(document.getElementById('divine-close-btn'));
    click(document.getElementById('diviner-container'));
    assert.equal(document.getElementById('divine-service-status').textContent, '占卜服务已就绪');
    assert.equal(env.requests.filter(url => url.endsWith('/health')).length, 1);
  } finally { releaseSections(); releaseHealth({ ok: false }); env.cleanup(); }
});


test('slow optional hero data does not block headings, sections or language changes', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const env = await setup('index.html', '?lang=en', {
    beforeFetch: url => /\/(cards|wordcloud)\.json$/.test(url) ? blocked : undefined
  });
  try {
    await load('home');
    await until(() => document.querySelector('#about-content'));
    assert.equal(document.getElementById('main-title').textContent, 'Dream Big, Work Hard, Stay Humble.');
    assert.equal(env.intervals.size, 0);
    click(document.querySelector('[data-language=zh]'));
    await until(() => document.documentElement.lang === 'zh');
    release();
    await until(() => env.intervals.size === 1);
    assert.equal(document.querySelectorAll('.card-container .card').length, 4);
    assert.match(document.getElementById('main-title').textContent, /梦想/);
    assert.equal(env.intervals.size, 1, 'stale hero data does not revive disposed widgets');
  } finally { release(); env.cleanup(); }
});

test('responsive images work on project paths and preserve unknown/external sources', async () => {
  const env = await setup('index.html');
  const { setImageSource, backgroundImage } = await import('../static/js/core/images.js');
  try {
    const img = document.createElement('img');
    setImageSource(img, './media/personal.jpg', { sizes: '200px', maxWidth: 640, eager: true });
    assert.ok(img.src.startsWith('http://localhost/project/media/optimized/'));
    assert.equal(img.sizes, '200px');
    assert.ok(img.srcset.includes('320w'));
    assert.ok(img.width > 0 && img.height > 0);
    assert.equal(img.loading, 'eager');
    assert.equal(img.getAttribute('fetchpriority'), 'high');
    setImageSource(img, 'https://example.org/photo.jpg');
    assert.equal(img.src, 'https://example.org/photo.jpg');
    assert.equal(img.srcset, '');
    assert.equal(img.getAttribute('fetchpriority'), null);
    setImageSource(img, './media/new-item.jpg');
    assert.equal(img.src, 'http://localhost/project/media/new-item.jpg');
    assert.equal(backgroundImage('./media/occupacy.jpg'), 'var(--site-default-background)');
  } finally { env.cleanup(); }
});

test('homepage shows complete pinned cards and count-free links; full routes keep every record', async () => {
  for (const lang of ['zh', 'en', 'jp']) {
    const env = await setup('index.html', `?lang=${lang}`);
    try {
      await load('home');
      await until(() => document.querySelector('#projects .section-more-link'));
      for (const source of ['publications', 'projects', 'blogs']) {
        const documentData = JSON.parse(await readFile(new URL(`data/content/${source}.json`, repo)));
        const cards = [...document.querySelectorAll(`#${source}-content .meta-card`)];
        const expected = documentData.items.filter(item => item.featuredOrder).sort((a, b) => a.featuredOrder - b.featuredOrder);
        assert.deepEqual(cards.map(card => card.dataset.itemId), expected.map(item => item.id));
        assert.ok(cards.every(card => !card.classList.contains('meta-card--compact')));
        const { resolveDocument, formatContentDate } = await import('../static/js/core/content.js');
        const localized = resolveDocument(documentData, source, lang)[source];
        for (const card of cards) {
          const item = localized.find(item => item.id === card.dataset.itemId);
          const plain = document.createElement('div'); plain.innerHTML = item.description || item.summary;
          assert.equal(card.querySelector('.meta-card-summary').textContent, plain.textContent);
          assert.equal(card.querySelector('.meta-card-date').textContent, formatContentDate(item.date || item.post_time));
          assert.ok(card.querySelector('.meta-card-meta-item'));
          assert.ok(card.querySelectorAll('.meta-card-actions > a').length >= (item.links?.length || 1));
        }
        assert.equal(document.querySelector(`#${source} .section-more-link`).textContent, documentData.translations[lang].view_all_label);
        const href = new URL(document.querySelector(`#${source} .section-more-link`).href);
        assert.equal(href.searchParams.get('page'), source); assert.equal(href.searchParams.get('lang'), lang);
        assert.equal(document.querySelector(`#${source} .feature-editor`), null);
      }
      assert.equal(env.requests.some(url => url.includes('/__editor/')), false);
    } finally { env.cleanup(); }
  }
});

test('homepage renders every pinned work when more than three are selected', async () => {
  const value = JSON.parse(await readFile(new URL('data/content/projects.json', repo)));
  value.items.forEach((item, index) => { item.featuredOrder = value.items.length - index; });
  const env = await setup('index.html', '?lang=zh', {
    response: async url => url.endsWith('/content/projects.json') ? { ok: true, json: async () => value } : undefined
  });
  try {
    await load('home');
    await until(() => document.querySelector('#projects .section-more-link'));
    const cards = [...document.querySelectorAll('#projects-content .meta-card')];
    assert.ok(cards.length > 3);
    assert.deepEqual(cards.map(card => card.dataset.itemId), value.items.map(item => item.id).reverse());
  } finally { env.cleanup(); }
});

test('local blog route mounts the selection editor with all available posts', async () => {
  const value = JSON.parse(await readFile(new URL('data/content/blogs.json', repo)));
  const env = await setup('multipage_index.html', '?page=blogs&lang=zh&edit=1', {
    response: async url => {
      if (url.endsWith('/__editor/session')) return { ok: true, json: async () => ({ token: 'local-blog-session' }) };
      if (url.includes('/__editor/featured?source=blogs')) return { ok: true, json: async () => ({ ids: [value.items[0].id], revision: 'blog-revision' }) };
    }
  });
  try {
    await load('home');
    await until(() => document.querySelector('#blogs .feature-editor-selected li'));
    assert.equal(document.querySelectorAll('#blogs .feature-editor-selected li').length, 1);
    assert.equal(document.querySelectorAll('#blogs .feature-editor-available li').length, value.items.length - 1);
    assert.equal(document.querySelectorAll('#blogs-content .meta-card').length, value.items.length);
  } finally { env.cleanup(); }
});

test('blog selections control homepage order while full blog lists retain unpinned posts', async () => {
  const value = JSON.parse(await readFile(new URL('data/content/blogs.json', repo)));
  value.items.forEach(item => delete item.featuredOrder);
  value.items[2].featuredOrder = 1;
  value.items[0].featuredOrder = 2;
  for (const page of ['index.html', 'multipage_index.html', 'blogs/index.html']) {
    const env = await setup(page, '?lang=zh&page=blogs', {
      response: async url => url.endsWith('/content/blogs.json') ? { ok: true, json: async () => value } : undefined
    });
    try {
      await load(page === 'blogs/index.html' ? 'blog-index' : 'home');
      if (page === 'index.html') {
        await until(() => document.querySelector('#blogs .section-more-link'));
        assert.deepEqual([...document.querySelectorAll('#blogs-content .meta-card')].map(card => card.dataset.itemId), [value.items[2].id, value.items[0].id]);
        assert.equal(document.querySelector('#blogs .blog-archive-callout'), null);
      } else {
        const selector = page === 'blogs/index.html' ? '#blog-post-list article' : '#blogs-content .meta-card';
        await until(() => document.querySelectorAll(selector).length === 3);
      }
    } finally { env.cleanup(); }
  }
});

test('unpinning everything leaves a useful full-list link on the homepage', async () => {
  const env = await setup('index.html', '?lang=zh', {
    response: async url => {
      if (!url.endsWith('/content/projects.json')) return;
      const value = JSON.parse(await readFile(new URL('data/content/projects.json', repo)));
      value.items.forEach(item => delete item.featuredOrder);
      return { ok: true, json: async () => value };
    }
  });
  try {
    await load('home');
    await until(() => document.querySelector('#projects .section-more-link'));
    assert.equal(document.querySelectorAll('#projects-content .meta-card').length, 0);
    assert.equal(document.querySelector('#projects-content').textContent, '代表作待更新。');
    assert.equal(document.querySelector('#projects .section-more-link').textContent, '查看全部项目');
  } finally { env.cleanup(); }
});

test('local editor supports all pins, reorders, saves and preserves drafts on a conflicting save', async () => {
  const env = await setup('multipage_index.html');
  const { mountFeatureEditor, hasFeatureDrafts } = await import('../static/js/components/feature-editor.js');
  const host = document.createElement('div'); document.body.appendChild(host);
  let conflict = false, saved = 0, writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      writes.push(JSON.parse(options.body));
      assert.equal(options.headers['X-Editor-Token'], 'local-session');
      if (conflict) return { ok: false, status: 409 };
      return { ok: true, json: async () => ({ ids: writes.at(-1).ids, revision: 'revision-2' }) };
    }
    return { ok: true, json: async () => String(url).endsWith('/session') ? { token: 'local-session' } : { ids: ['a', 'b', 'c'], revision: 'revision-1' } };
  };
  const cleanup = mountFeatureEditor(host, { source: 'projects', language: 'zh', data: { projects: ['a', 'b', 'c', 'd'].map(id => ({ id, title: id })) }, onSaved: () => saved++ });
  const control = (label) => [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label);
  try {
    await until(() => host.querySelector('.feature-editor-selected li'));
    assert.equal(control('置顶：d').disabled, false);
    click(control('置顶：d'));
    assert.equal(host.querySelectorAll('.feature-editor-selected li').length, 4);
    assert.equal(hasFeatureDrafts(), true);
    click(control('上移：d'));
    click(control('保存选择'));
    await until(() => saved === 1);
    assert.deepEqual(writes[0], { source: 'projects', ids: ['a', 'b', 'd', 'c'], revision: 'revision-1' });
    assert.equal(control('保存选择').disabled, true);
    assert.equal(hasFeatureDrafts(), false);
    conflict = true;
    click(control('取消置顶：c'));
    click(control('保存选择'));
    await until(() => host.querySelector('[role=status]').textContent.includes('其他地方'));
    assert.equal(saved, 1);
    assert.deepEqual([...host.querySelectorAll('.feature-editor-selected li')].map(el => el.dataset.itemId), ['a', 'b', 'd']);
    click(control('撤销修改'));
    assert.deepEqual([...host.querySelectorAll('.feature-editor-selected li')].map(el => el.dataset.itemId), ['a', 'b', 'd', 'c']);
  } finally { cleanup(); env.cleanup(); }
});


test('editor drafts survive reload and content refresh without blocking navigation or losing other sections', async () => {
  const env = await setup('multipage_index.html', '?page=publications&lang=zh&edit=1');
  const key = 'homepage-feature-drafts-v1';
  window.sessionStorage.setItem(key, JSON.stringify({ blogs: { ids: ['post'], saved: [], revision: 'blog-rev' } }));
  const host = document.createElement('div'); document.body.appendChild(host);
  let revision = 'before-content-change', submitted, refreshed = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      submitted = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ids: submitted.ids, revision: 'saved' }) };
    }
    return { ok: true, json: async () => String(url).endsWith('/session') ? { token: 'never-store-this' } : { ids: ['a'], revision } };
  };
  const control = name => [...host.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === name);
  let cleanup;
  try {
    const first = await import('../static/js/components/feature-editor.js?draft-reload-first');
    cleanup = first.mountFeatureEditor(host, { source: 'publications', data: { publications: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, language: 'zh' });
    await until(() => control('置顶：B'));
    click(control('置顶：B'));
    assert.equal(first.hasFeatureDrafts(), true);
    assert.equal(first.preserveFeatureDrafts(), true);
    assert.ok(!window.sessionStorage.getItem(key).includes('never-store-this'));
    cleanup(); host.replaceChildren();
    revision = 'after-content-change';
    const reloaded = await import('../static/js/components/feature-editor.js?draft-reload-second');
    cleanup = reloaded.mountFeatureEditor(host, { source: 'publications', data: { publications: ['a', 'b', 'c'].map(id => ({ id, title: id.toUpperCase() })) }, language: 'zh', onRefresh: () => refreshed++ });
    await until(() => control('取消置顶：B'));
    assert.deepEqual([...host.querySelectorAll('.feature-editor-selected li')].map(el => el.dataset.itemId), ['a', 'b']);
    assert.ok(control('置顶：C'));
    click(control('刷新内容')); assert.equal(refreshed, 1);
    click(control('保存选择'));
    await until(() => host.querySelector('[role=status]').textContent.includes('已保存'));
    assert.equal(submitted.revision, 'after-content-change');
    const remaining = JSON.parse(window.sessionStorage.getItem(key));
    assert.equal(remaining.publications, undefined);
    assert.deepEqual(remaining.blogs.ids, ['post']);
  } finally { cleanup?.(); env.cleanup(); }
});

test('drag handles move across multiple items, cancel safely and save the new order', async () => {
  const env = await setup('multipage_index.html');
  const { mountFeatureEditor } = await import('../static/js/components/feature-editor.js?drag-test');
  const host = document.createElement('div'); document.body.appendChild(host);
  host.setPointerCapture = () => {};
  host.hasPointerCapture = () => false;
  let submitted;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      submitted = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ids: submitted.ids, revision: 'saved' }) };
    }
    return { ok: true, json: async () => String(url).endsWith('/session') ? { token: 'local' } : { ids: ['a', 'b', 'c', 'd'], revision: 'initial' } };
  };
  const cleanup = mountFeatureEditor(host, { source: 'projects', data: { projects: ['a', 'b', 'c', 'd'].map(id => ({ id, title: id })) }, language: 'zh' });
  const rows = () => [...host.querySelectorAll('.feature-editor-selected li')];
  const order = () => rows().map(el => el.dataset.itemId);
  const pointer = (target, type, y) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true } });
    target.dispatchEvent(event);
  };
  const geometry = () => rows().forEach((row, i) => { row.getBoundingClientRect = () => ({ top: 100 + i * 100, height: 100 }); });
  try {
    await until(() => host.querySelector('.feature-editor-drag'));
    geometry();
    pointer(rows()[0].querySelector('.feature-editor-drag'), 'pointerdown', 150);
    pointer(host, 'pointermove', 480);
    pointer(host, 'pointerup', 480);
    assert.deepEqual(order(), ['b', 'c', 'd', 'a']);
    assert.equal(document.activeElement.closest('li').dataset.itemId, 'a');
    geometry();
    pointer(rows()[3].querySelector('.feature-editor-drag'), 'pointerdown', 450);
    pointer(host, 'pointermove', 110);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepEqual(order(), ['b', 'c', 'd', 'a']);
    assert.equal(host.classList.contains('feature-editor--dragging'), false);
    const last = rows()[3].querySelector('.feature-editor-drag');
    last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.deepEqual(order(), ['a', 'b', 'c', 'd']);
    rows()[0].querySelector('.feature-editor-drag').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.deepEqual(order(), ['b', 'c', 'd', 'a']);
    click([...host.querySelectorAll('button')].find(el => el.textContent === '保存选择'));
    await until(() => host.querySelector('[role=status]').textContent.includes('已保存'));
    assert.deepEqual(submitted.ids, ['b', 'c', 'd', 'a']);
  } finally { cleanup(); env.cleanup(); }
});

test('news pins select homepage entries and editor uses readable dated content', async () => {
  const value = JSON.parse(await readFile(new URL('data/content/news.json', repo)));
  for (const lang of ['en', 'zh', 'jp']) {
    const env = await setup('index.html', `?lang=${lang}`);
    try {
      await load('home');
      await until(() => document.querySelector('#news .section-more-link'));
      const expected = value.items.filter(item => item.featuredOrder).sort((a, b) => a.featuredOrder - b.featuredOrder);
      assert.deepEqual([...document.querySelectorAll('#news-content [data-item-id]')].map(el => el.dataset.itemId), expected.map(item => item.id));
      assert.equal(document.querySelector('#news .section-more-link').textContent, value.translations[lang].view_all_label);
    } finally { env.cleanup(); }
  }
  const env = await setup('multipage_index.html', '?page=news&lang=zh&edit=1', {
    response: async url => {
      if (url.endsWith('/__editor/session')) return { ok: true, json: async () => ({ token: 'news-test' }) };
      if (url.includes('/__editor/featured?source=news')) return { ok: true, json: async () => ({ ids: [], revision: 'news-test' }) };
    }
  });
  try {
    await load('home');
    await until(() => document.querySelector('#news .feature-editor-available li'));
    assert.equal(document.querySelector('#news .feature-editor h2').textContent, '首页新闻');
    assert.equal(document.querySelectorAll('#news .feature-editor-available li').length, value.items.length);
    assert.equal(document.querySelectorAll('#news-content [data-item-id]').length, value.items.length);
    const row = document.querySelector('#news .feature-editor-available li');
    assert.match(row.textContent, /2026\.10\.16 · MOSS-Image/);
    assert.equal(row.querySelector('a'), null);
  } finally { env.cleanup(); }
});

test('switching locale updates list controls and an open diviner without discarding input', async () => {
  const env = await setup('multipage_index.html', '?page=publications&lang=en', {
    meta: config => { config.add_diviner = true; config.divine = { prewarm: false, useLLM: true }; }
  });
  try {
    await load('home');
    await until(() => document.querySelector('#publications-content .meta-card') && document.getElementById('diviner-container'));
    click(document.getElementById('diviner-container'));
    const panel = document.getElementById('divine-window');
    const question = panel.querySelector('#divine-query');
    assert.equal(question.value, "Today's fortune");
    question.value = 'Keep my question';
    question.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(panel.querySelector('#mode-Tarot'));
    click(panel.querySelector('#divine-use-llm'));
    const expected = {
      en: ['Search…', 'Sort', 'Start divination', 'Switch to single-page mode', 'Back to top', 'Switch to dark mode'],
      zh: ['搜索…', '排序', '开始占卜', '切换为单页模式', '返回顶部', '切换为深色模式'],
      jp: ['検索…', '並べ替え', '占いを始める', 'シングルページ表示に切り替える', 'ページの先頭へ', 'ダークモードへ切り替える']
    };
    for (const lang of ['zh', 'jp', 'en']) {
      click(document.querySelector(`[data-language="${lang}"]`));
      await until(() => !document.getElementById('content-root').hasAttribute('aria-busy'));
      const copy = expected[lang];
      assert.equal(document.querySelector('.meta-search').placeholder, copy[0]);
      assert.equal(document.querySelector('.meta-sort').getAttribute('aria-label'), copy[1]);
      assert.equal(panel.querySelector('#divine-submit').textContent, copy[2]);
      assert.equal(document.getElementById('layout-mode-toggle').title, copy[3]);
      assert.equal(document.getElementById('back-to-top').title, copy[4]);
      assert.equal(document.getElementById('dark-mode-toggle-mobile').title, copy[5]);
      assert.equal(document.getElementById('divine-window'), panel);
      assert.equal(question.value, 'Keep my question');
      assert.equal(panel.querySelector('#mode-Tarot').checked, true);
      assert.equal(panel.querySelector('#divine-use-llm').checked, false);
    }
  } finally { env.cleanup(); }
});
