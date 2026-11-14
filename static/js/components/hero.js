import { createScope } from '../core/lifecycle.js';
import { assetURL, isValidUrl } from '../core/links.js';
import { setImageSource } from '../core/images.js';
import { observeActivity } from '../core/activity.js';

let cloudLibrary;
function loadCloudLibrary() {
  if (window.TagCanvas) return Promise.resolve(window.TagCanvas);
  if (!cloudLibrary) cloudLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.goat1000.com/tagcanvas.min.js';
    script.onload = () => resolve(window.TagCanvas);
    script.onerror = () => { script.remove(); cloudLibrary = null; reject(new Error('Word cloud unavailable')); };
    document.head.appendChild(script);
  });
  return cloudLibrary;
}

export function mountCarousel(container, scope = createScope()) {
  const cards = [...container.querySelectorAll('.card')];
  const previous = container.querySelector('#prev-btn');
  const next = container.querySelector('#next-btn');
  let current = 0;
  let active = false;
  observeActivity(container, scope, value => { active = value; });
  const show = index => {
    current = (index + cards.length) % cards.length;
    cards.forEach((card, i) => {
      card.classList.toggle('active', i === current);
      card.setAttribute('aria-hidden', String(i !== current));
    });
  };
  if (previous) { previous.disabled = cards.length < 2; scope.on(previous, 'click', () => show(current - 1)); }
  if (next) { next.disabled = cards.length < 2; scope.on(next, 'click', () => show(current + 1)); }
  if (cards.length) show(0);
  if (cards.length > 1) scope.interval(() => {
    if (active && !container.matches(':hover') && !container.contains(document.activeElement)) show(current + 1);
  }, 5000);
  return () => scope.destroy();
}

export function mountHero(root, { meta, copy, cards = [], words = [] }) {
  const scope = createScope();
  root.innerHTML = `
    <div class="mp-home-hero">
      <div class="mp-home-cards"><div class="card-container">
        <button class="arrow-btn arrow-left" id="prev-btn" aria-label="Previous card"><i class="fas fa-arrow-left"></i></button>
        <button class="arrow-btn arrow-right" id="next-btn" aria-label="Next card"><i class="fas fa-arrow-right"></i></button>
      </div></div>
      <div class="mp-home-avatar"><figure class="image is-128x128 is-inline-block"><img class="is-rounded" alt="Portrait" width="128" height="128" decoding="async" fetchpriority="high"></figure></div>
      <div class="mp-home-cloud"><div id="canvas-container"><canvas id="word-cloud" width="400" height="300"></canvas><ul id="tags"></ul></div></div>
    </div>
    <div class="mp-home-meta"><h1 class="title is-size-3-tablet is-size-4-mobile" id="main-title"></h1>
    <p class="subtitle is-size-4-tablet is-size-5-mobile" id="main-subtitle"></p><div class="icon-box"></div></div>`;
  setImageSource(root.querySelector('img'), meta.home?.avatar || './media/personal.jpg', { sizes: '128px', maxWidth: 640, eager: true });
  root.querySelector('#main-title').innerHTML = copy.title || '';
  root.querySelector('#main-subtitle').innerHTML = copy.subtitle || '';
  const box = root.querySelector('.icon-box');
  for (const social of meta.socials || []) {
    if (!isValidUrl(social.url)) continue;
    const anchor = document.createElement('a');
    anchor.href = assetURL(social.url);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', social.label || social.icon?.replace(/fa[bs]? fa-/, '') || 'Social link');
    if (social.download) anchor.download = '';
    const icon = document.createElement('i');
    icon.className = social.icon || 'fas fa-link';
    anchor.appendChild(icon);
    box.appendChild(anchor);
  }
  let mounted = true;
  scope.add(() => { mounted = false; });
  const whenReady = (value, render) => {
    if (Array.isArray(value)) render(value);
    else Promise.resolve(value).then(items => { if (mounted) render(items); }).catch(error => console.warn(error));
  };
  for (const [selector, value] of [['.mp-home-cards', cards], ['.mp-home-cloud', words]]) {
    const widget = root.querySelector(selector);
    widget.hidden = Array.isArray(value) && !value.length;
    if (!Array.isArray(value)) widget.dataset.pendingWidget = '';
  }
  whenReady(cards, cards => {
    delete root.querySelector('.mp-home-cards').dataset.pendingWidget;
    const container = root.querySelector('.card-container');
    for (const item of cards) {
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('div');
      title.className = 'card-title'; title.innerHTML = item.title || '';
      const description = document.createElement('div');
      description.className = 'card-description'; description.innerHTML = item.description || '';
      card.append(title, description); container.appendChild(card);
    }
    root.querySelector('.mp-home-cards').hidden = !cards.length;
    mountCarousel(container, scope);
  });
  whenReady(words, words => {
    const cloud = root.querySelector('.mp-home-cloud');
    delete cloud.dataset.pendingWidget;
    cloud.hidden = meta.home?.showWordCloud === false || !words.length;
    if (!cloud.hidden) {
      const tags = root.querySelector('#tags');
      for (const item of words) {
        const li = document.createElement('li');
        const tag = document.createElement('a');
        tag.textContent = item.text; tag.title = item.title || item.text; tag.href = '#';
        tag.dataset.weight = item.weight || 1;
        scope.on(tag, 'click', event => event.preventDefault());
        li.appendChild(tag); tags.appendChild(li);
      }
      let alive = true, running = false, started = false, loading = false;
      let library;
      // Text remains available before the optional library loads, including for
      // reduced motion. Never fetch or animate a cloud that hasn't been seen.
      cloud.classList.add('cloud-unavailable');
      observeActivity(cloud, scope, async active => {
        running = active;
        if (started) {
          library[active ? 'Resume' : 'Pause']?.('word-cloud');
          return;
        }
        if (!active || loading || !alive) return;
        loading = true;
        try {
          library = await loadCloudLibrary();
          if (!alive || !root.isConnected) return;
          if (!running) { loading = false; return; }
          cloud.classList.remove('cloud-unavailable');
          library.Start('word-cloud', 'tags', {
            textColour: '#FFFFFF', outlineColour: 'rgba(255,255,255,0.5)',
            reverse: true, depth: 0.8, maxSpeed: 0.01, textHeight: 20,
            textFont: 'Arial, sans-serif', dragControl: true, weight: true,
            initial: [0.3, 0.3], tooltip: true
          });
          started = true;
        } catch (error) {
          if (alive) { cloud.classList.add('cloud-unavailable'); console.warn(error.message); }
        }
      });
      scope.add(() => { alive = false; if (started) library.Delete('word-cloud'); started = false; });
    }
  });
  return () => scope.destroy();
}
