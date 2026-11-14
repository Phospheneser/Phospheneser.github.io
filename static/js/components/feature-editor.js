import { siteURL } from '../core/data.js';
import { createScope } from '../core/lifecycle.js';

const copy = {
  en: { title: 'Homepage selections', intro: 'Choose any number of works, including none, and arrange their order. The full list keeps every item.', drag: 'Drag to reorder', pinned: 'Pinned', available: 'Other works', pin: 'Pin', unpin: 'Unpin', up: 'Move up', down: 'Move down', save: 'Save selections', reset: 'Discard changes', preview: 'View homepage', refresh: 'Refresh content', loading: 'Loading local editor…', ready: 'Selections saved on this computer. Publish the site to share them.', dirty: 'Unsaved changes', saving: 'Saving…', empty: 'No pinned works yet.', unavailable: 'Start the local editing server to use this page.', conflict: 'Content changed elsewhere. Reload the page before saving.', failed: 'Could not save. Your changes are still here; try again.' },
  zh: { title: '首页代表作', intro: '置顶数量不限，也可以不选，调整顺序后保存。完整列表会保留所有内容。', drag: '拖动排序', pinned: '已置顶', available: '其他作品', pin: '置顶', unpin: '取消置顶', up: '上移', down: '下移', save: '保存选择', reset: '撤销修改', preview: '查看首页', refresh: '刷新内容', loading: '正在加载本地编辑器…', ready: '已保存到本机，发布网站后访客即可看到。', dirty: '有未保存的修改', saving: '正在保存…', empty: '还没有选择代表作。', unavailable: '请使用本地编辑服务启动此页面。', conflict: '内容已在其他地方修改，请刷新页面后再保存。', failed: '保存失败，修改仍保留，请重试。' },
  jp: { title: 'ホームページの代表作', intro: '件数の制限なく選び、順序を調整して保存します。未選択でも保存できます。一覧にはすべての作品が残ります。', drag: 'ドラッグして並べ替え', pinned: '固定済み', available: 'その他の作品', pin: '固定する', unpin: '固定を解除', up: '上へ', down: '下へ', save: '選択を保存', reset: '変更を破棄', preview: 'ホームを見る', refresh: '内容を更新', loading: 'ローカルエディターを読み込み中…', ready: 'この端末に保存しました。公開後に訪問者にも反映されます。', dirty: '未保存の変更があります', saving: '保存中…', empty: '代表作は未選択です。', unavailable: 'ローカル編集サーバーを起動してください。', conflict: '別の場所で更新されました。再読み込みしてから保存してください。', failed: '保存できませんでした。変更を保持しています。再試行してください。' }
};
// Keep local drafts across routes and reloads in this tab. Session storage
// contains only selections and revisions, never the editor credential.
const drafts = new Map();
const listeners = new Map();
const draftKey = 'homepage-feature-drafts-v1';

function readDraft(source) {
  try {
    const model = JSON.parse(window.sessionStorage.getItem(draftKey) || '{}')[source];
    if (model && typeof model.revision === 'string' && [model.ids, model.saved].every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length)) return model;
  } catch { /* Storage may be unavailable. Keep the leave-page warning then. */ }
}

export function preserveFeatureDrafts() {
  if ([...drafts.values()].some(model => model.saving)) return false;
  try {
    const pending = { ...JSON.parse(window.sessionStorage.getItem(draftKey) || '{}') };
    for (const [source, { ids, saved, revision }] of drafts) {
      if (JSON.stringify(ids) === JSON.stringify(saved)) delete pending[source];
      else pending[source] = { ids, saved, revision };
    }
    window.sessionStorage.setItem(draftKey, JSON.stringify(pending));
    return true;
  } catch { return false; }
}

export function hasFeatureDrafts() {
  return [...drafts.values()].some(model => model.saving || JSON.stringify(model.ids) !== JSON.stringify(model.saved));
}

async function json(path, options = {}) {
  const response = await fetch(siteURL(path), { cache: 'no-store', credentials: 'same-origin', ...options });
  if (!response.ok) { const error = new Error('Editor request failed'); error.status = response.status; throw error; }
  return response.json();
}

export function mountFeatureEditor(host, { source, data, language, onSaved = () => {}, onRefresh = () => {} }) {
  const labels = { ...(copy[language] || copy.en), ...data.editor_labels };
  const scope = createScope();
  const controller = new AbortController();
  let alive = true, ready = false, saving = false, token;
  let model = drafts.get(source) || readDraft(source);
  const items = data[source] || [];
  const titles = new Map(items.map(item => {
    const text = document.createElement('span'); text.innerHTML = item.title || item.content || item.id;
    if (!item.title && item.date) text.prepend(document.createTextNode(`${item.date} · `));
    return [item.id, text.textContent];
  }));
  const dirty = () => model && JSON.stringify(model.ids) !== JSON.stringify(model.saved);
  host.className = 'feature-editor';
  host.setAttribute('aria-label', labels.title);
  const heading = document.createElement('h2'); heading.textContent = labels.title;
  const intro = document.createElement('p'); intro.textContent = labels.intro;
  const lists = document.createElement('div'); lists.className = 'feature-editor-lists';
  const actions = document.createElement('div'); actions.className = 'feature-editor-actions';
  const status = document.createElement('p'); status.className = 'feature-editor-status'; status.setAttribute('role', 'status');
  const button = (label, action, ariaLabel = label) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
    el.setAttribute('aria-label', ariaLabel); el.onclick = action; return el;
  };
  const save = button(labels.save, async () => {
    if (!ready || saving || !dirty()) return;
    saving = true; model.saving = true; status.textContent = labels.saving; render();
    const submitted = [...model.ids];
    let outcome = 'ready';
    // Let a submitted save finish even when navigating within the local editor.
    // Its shared model and cache update must agree with the file on disk.
    try {
      const result = await json('__editor/featured', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token },
        body: JSON.stringify({ source, ids: submitted, revision: model.revision })
      });
      model.saved = [...result.ids]; model.ids = [...result.ids]; model.revision = result.revision;
      onSaved();
      if (alive) status.textContent = labels.ready;
    } catch (error) {
      outcome = error.status === 409 ? 'conflict' : 'failed';
      if (alive) status.textContent = error.status === 409 ? labels.conflict : labels.failed;
    } finally {
      saving = false; model.saving = false; preserveFeatureDrafts();
      for (const listener of listeners.get(source) || []) listener(outcome);
    }
  });
  const reset = button(labels.reset, () => { model.ids = [...model.saved]; preserveFeatureDrafts(); status.textContent = ''; render(); });
  const refresh = button(labels.refresh, () => { if (!saving && !model?.saving) onRefresh(); });
  const preview = document.createElement('a'); preview.textContent = labels.preview;
  preview.href = siteURL(`index.html?lang=${language}#${source}`);
  preview.target = '_blank'; preview.rel = 'noopener';
  actions.append(save, reset, refresh, preview); host.append(heading, intro, lists, actions, status);

  let drag = null, scrollFrame;
  function positionDraggedRow() {
    if (!drag?.moved) return;
    const others = [...drag.list.children].filter(row => row !== drag.row);
    const before = others.find(row => { const rect = row.getBoundingClientRect(); return drag.y < rect.top + rect.height / 2; });
    if (before) drag.list.insertBefore(drag.row, before);
    else drag.list.appendChild(drag.row);
  }
  function scrollWhileDragging() {
    if (!drag) return;
    if (drag.moved) {
      const edge = 64;
      const speed = drag.y < edge ? -12 : drag.y > window.innerHeight - edge ? 12 : 0;
      if (speed) { window.scrollBy(0, speed); positionDraggedRow(); }
    }
    scrollFrame = window.requestAnimationFrame(scrollWhileDragging);
  }
  function finishDrag(commit) {
    if (!drag) return;
    const current = drag; drag = null;
    window.cancelAnimationFrame(scrollFrame);
    host.classList.remove('feature-editor--dragging');
    current.row.classList.remove('is-dragging');
    if (host.hasPointerCapture?.(current.pointerId)) host.releasePointerCapture(current.pointerId);
    if (commit && current.moved) update([...current.list.children].map(row => row.dataset.itemId));
    else render();
    [...host.querySelectorAll('.feature-editor-drag')].find(handle => handle.closest('li').dataset.itemId === current.id)?.focus({ preventScroll: true });
  }
  scope.on(host, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    if (Math.abs(drag.y - drag.startY) >= 4) drag.moved = true;
    positionDraggedRow();
  });
  scope.on(host, 'pointerup', event => { if (event.pointerId === drag?.pointerId) finishDrag(true); });
  scope.on(host, 'pointercancel', () => finishDrag(false));
  scope.on(host, 'lostpointercapture', () => finishDrag(false));
  scope.on(document, 'keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); finishDrag(false); }
  });
  scope.add(() => {
    window.cancelAnimationFrame(scrollFrame);
    if (drag) {
      const pointerId = drag.pointerId; drag = null;
      if (host.hasPointerCapture?.(pointerId)) host.releasePointerCapture(pointerId);
    }
    host.classList.remove('feature-editor--dragging');
  });

  function update(ids) {
    if (saving || model?.saving) return;
    model.ids = ids; drafts.set(source, model); preserveFeatureDrafts();
    status.textContent = dirty() ? labels.dirty : ''; render();
  }
  function render() {
    lists.replaceChildren();
    save.disabled = !ready || saving || model?.saving || !dirty();
    reset.disabled = save.disabled;
    refresh.disabled = saving || model?.saving;
    if (!ready) return;
    for (const selected of [true, false]) {
      const column = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = selected ? labels.pinned : labels.available;
      const list = document.createElement(selected ? 'ol' : 'ul');
      list.className = selected ? 'feature-editor-selected' : 'feature-editor-available';
      const ids = selected ? model.ids : items.map(item => item.id).filter(id => !model.ids.includes(id));
      if (selected && !ids.length) { const empty = document.createElement('p'); empty.textContent = labels.empty; list.appendChild(empty); }
      ids.forEach((id, index) => {
        const row = document.createElement('li'); row.dataset.itemId = id;
        const title = document.createElement('span'); title.textContent = titles.get(id) || id;
        const controls = document.createElement('div'); controls.className = 'feature-editor-row-actions';
        if (selected) {
          const handle = button('⠿', () => {}, `${labels.drag}：${title.textContent}`);
          handle.className = 'feature-editor-drag'; handle.title = labels.drag;
          handle.disabled = saving || model.saving || ids.length < 2;
          handle.addEventListener('pointerdown', event => {
            if (handle.disabled || drag || event.button !== 0 || event.isPrimary === false) return;
            event.preventDefault(); handle.focus({ preventScroll: true });
            host.setPointerCapture(event.pointerId);
            drag = { id, row, list, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, moved: false };
            row.classList.add('is-dragging'); host.classList.add('feature-editor--dragging');
            scrollFrame = window.requestAnimationFrame(scrollWhileDragging);
          });
          handle.onkeydown = event => {
            if (handle.disabled || drag || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
            const next = [...model.ids]; next.splice(index, 1); next.splice(target, 0, id); update(next);
            [...host.querySelectorAll('.feature-editor-drag')].find(el => el.closest('li').dataset.itemId === id)?.focus();
          };
          row.appendChild(handle);
          for (const [delta, label, glyph] of [[-1, labels.up, '↑'], [1, labels.down, '↓']]) {
            const move = button(glyph, () => { const next = [...model.ids]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; update(next); }, `${label}：${title.textContent}`);
            move.disabled = saving || model.saving || index + delta < 0 || index + delta >= ids.length;
            controls.appendChild(move);
          }
        }
        const toggle = button(selected ? labels.unpin : labels.pin, () => update(selected ? model.ids.filter(value => value !== id) : [...model.ids, id]), `${selected ? labels.unpin : labels.pin}：${title.textContent}`);
        toggle.disabled = saving || model.saving;
        controls.appendChild(toggle); row.append(title, controls); list.appendChild(row);
      });
      column.append(title, list); lists.appendChild(column);
    }
  }
  scope.add(() => { alive = false; controller.abort(); });
  status.textContent = labels.loading; render();
  Promise.all([
    json('__editor/session', { signal: controller.signal }),
    json(`__editor/featured?source=${encodeURIComponent(source)}`, { signal: controller.signal })
  ]).then(([session, saved]) => {
    if (!alive) return;
    token = session.token;
    if (!model || (!dirty() && !model.saving)) model = { ids: [...saved.ids], saved: [...saved.ids], revision: saved.revision };
    // New articles or translations do not conflict with the user's selection.
    // Rebase only when the saved selection itself has not changed on disk.
    if (dirty() && !model.saving && JSON.stringify(model.saved) === JSON.stringify(saved.ids)) {
      model.revision = saved.revision;
      model.ids = model.ids.filter(id => titles.has(id));
    }
    drafts.set(source, model); preserveFeatureDrafts();
    ready = true; status.textContent = dirty() ? labels.dirty : ''; render();
  }).catch(() => { if (alive) status.textContent = labels.unavailable; });
  if (!listeners.has(source)) listeners.set(source, new Set());
  const changed = outcome => { if (alive && ready) { status.textContent = labels[outcome]; render(); } };
  listeners.get(source).add(changed);
  scope.add(() => listeners.get(source).delete(changed));
  return () => scope.destroy();
}
