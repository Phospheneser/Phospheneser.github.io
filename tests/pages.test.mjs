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
    await until(() => document.querySelector('#publications-content .meta-card'));
    assert.equal(document.querySelectorAll('#publications-content .meta-card').length, 8);
    assert.equal(document.querySelectorAll('#projects-content .meta-card').length, 6);
    assert.equal(document.querySelectorAll('#blogs-content .meta-card').length, 3);
    assert.equal(document.querySelectorAll('.experience-item').length, 8);
    assert.equal(env.intervals.size, 1);
    assert.equal(env.requests.some(url => url.endsWith('/health')), false, 'disabled diviner never prewarms');
    for (const lang of ['zh', 'jp', 'en', 'zh']) {
      click(document.querySelector(`[data-language="${lang}"]`));
      await until(() => !document.getElementById('meta-sections-root').hasAttribute('aria-busy'));
      assert.equal(document.documentElement.lang, lang === 'jp' ? 'ja' : lang);
      assert.equal(document.querySelectorAll('#publications-content .meta-card').length, 8);
      assert.equal(env.intervals.size, 1, 'only one live carousel interval');
      assert.equal(document.querySelector('#blogs-content a.blog-card-title').href.includes(`lang=${lang}`), true);
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
    assert.equal(document.querySelectorAll('#projects-content .meta-card').length, 6);
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
    await until(() => document.querySelectorAll('#publications-content .meta-card').length === 8);
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
    await until(() => document.querySelectorAll('#publications-content .meta-card').length === 8);
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
    assert.equal(document.querySelectorAll('#awards-content .section-text-block').length, 15);
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
