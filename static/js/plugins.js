import { selectItems } from './core/content.js';
import { createScope } from './core/lifecycle.js';

const registry = new Map();
export const PluginRegistry = {
  register(name, plugin) {
    if (registry.has(name)) throw new Error(`Plugin already registered: ${name}`);
    if (typeof plugin.mount !== 'function') throw new TypeError('A plugin needs mount(context)');
    registry.set(name, plugin);
  },
  get(name) { return registry.get(name); }
};

PluginRegistry.register('search', {
  mount({ controls, update, labels, scope }) {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'input meta-search';
    input.placeholder = labels.search_placeholder || 'Search…';
    input.setAttribute('aria-label', input.placeholder);
    controls.appendChild(input);
    scope.on(input, 'input', () => update({ search: input.value }));
  }
});
PluginRegistry.register('sort', {
  mount({ controls, update, labels, scope }) {
    const select = document.createElement('select');
    select.className = 'meta-sort';
    const copy = labels.sort_labels || {};
    for (const [value, label] of [
      ['', copy.default || 'Original order'],
      ['date-desc', copy.date_desc || 'Date (newest)'],
      ['date-asc', copy.date_asc || 'Date (oldest)'],
      ['title-asc', copy.title_asc || 'Title (A–Z)'],
      ['title-desc', copy.title_desc || 'Title (Z–A)']
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.setAttribute('aria-label', copy.default || 'Sort');
    const wrapper = document.createElement('div');
    wrapper.className = 'select';
    wrapper.appendChild(select);
    controls.appendChild(wrapper);
    scope.on(select, 'change', () => update({ sort: select.value }));
  }
});

// Plugins operate on source records, not a renderer's DOM structure.
export function mountList({ section, mode, data, container, controls, renderer, labels, language }) {
  const scope = createScope();
  const items = data[section.dataSource || section.id] || data.items || [];
  let state = { language, search: '', sort: '' };
  let cleanup;
  const plugins = (section[mode]?.plugins || []).map(name => {
    const plugin = PluginRegistry.get(name);
    if (!plugin) throw new Error(`Unknown plugin: ${name}`);
    return plugin;
  });
  const redraw = () => {
    cleanup?.();
    const selected = plugins.reduce((result, plugin) => plugin.transform ? plugin.transform(result, state) : result, selectItems(items, state));
    cleanup = renderer.drawList(selected, section, container, data);
  };
  const update = patch => { state = { ...state, ...patch }; redraw(); };
  for (const plugin of plugins) {
    scope.add(plugin.mount({ section, controls, items, state: () => state, update, labels, scope }));
  }
  redraw();
  return () => { scope.destroy(); cleanup?.(); };
}
