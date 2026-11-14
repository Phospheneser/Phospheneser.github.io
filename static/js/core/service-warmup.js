import { divineEndpoint, resolveDivineServer } from './divination.js';

// A readiness hint, never a prerequisite for a real request. No polling/heartbeat.
export function createServiceWarmup({ fetcher = (...args) => fetch(...args), now = Date.now,
  storage = null, locks = null, readyTTL = 5 * 60_000, failureTTL = 30_000, timeoutMs = 75_000 } = {}) {
  const pending = new Map();
  const memory = new Map();
  const keyFor = endpoint => `divine-warmup-v1:${endpoint}`;
  const cached = endpoint => {
    let record = memory.get(endpoint);
    try {
      const shared = JSON.parse(storage?.getItem(keyFor(endpoint)) || 'null');
      if (shared && (!record || shared.at > record.at)) record = shared;
    } catch { /* Storage may be disabled. In-page deduplication still works. */ }
    if (!record || typeof record.ok !== 'boolean' || !Number.isFinite(record.at)) return undefined;
    const age = now() - record.at;
    return age >= 0 && age < (record.ok ? readyTTL : failureTTL) ? record.ok : undefined;
  };
  const remember = (endpoint, ok) => {
    const record = { ok, at: now() };
    memory.set(endpoint, record);
    try { storage?.setItem(keyFor(endpoint), JSON.stringify(record)); } catch { /* Optional. */ }
    return ok;
  };
  function ensure(serverUrl) {
    let endpoint;
    try { endpoint = divineEndpoint(serverUrl, 'health').href; } catch { return Promise.resolve(false); }
    if (pending.has(endpoint)) return pending.get(endpoint);
    const hint = cached(endpoint);
    if (hint !== undefined) return Promise.resolve(hint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const check = async () => {
      // Another tab may have finished while this tab was waiting for the lock.
      const shared = cached(endpoint);
      if (shared !== undefined) return shared;
      if (controller.signal.aborted) return false;
      try {
        const response = await fetcher(endpoint, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Health check failed');
        const data = await response.json();
        if (data.success !== true || data.status !== 'ok') throw new Error('Service is not ready');
        return remember(endpoint, true);
      } catch {
        // A successful business request is stronger evidence than a failed probe.
        return cached(endpoint) === true || remember(endpoint, false);
      }
    };
    const task = Promise.resolve().then(async () => {
      if (locks?.request) {
        try { return await locks.request(keyFor(endpoint), { signal: controller.signal }, check); }
        catch {
          if (controller.signal.aborted) return cached(endpoint) === true || remember(endpoint, false);
          // Restricted contexts can expose the API but reject lock acquisition.
        }
      }
      return check();
    }).finally(() => { clearTimeout(timer); pending.delete(endpoint); });
    pending.set(endpoint, task);
    return task;
  }
  function isReady(serverUrl) {
    try { return cached(divineEndpoint(serverUrl, 'health').href) === true; } catch { return false; }
  }
  function noteReady(serverUrl) {
    try { remember(divineEndpoint(serverUrl, 'health').href, true); } catch { /* Invalid config. */ }
  }
  return { ensure, isReady, noteReady };
}

export const serviceWarmup = createServiceWarmup({
  storage: {
    getItem: key => globalThis.localStorage?.getItem(key),
    setItem: (key, value) => globalThis.localStorage?.setItem(key, value)
  },
  locks: {
    request: (name, options, callback) => globalThis.navigator?.locks?.request
      ? globalThis.navigator.locks.request(name, options, callback) : callback()
  }
});

export function attachServiceWarmup(meta, scope) {
  if (meta.add_diviner === false || meta.divine?.prewarm === false) return;
  const warm = () => { if (!document.hidden) void serviceWarmup.ensure(resolveDivineServer(meta)); };
  scope.on(document, 'visibilitychange', warm);
  scope.on(window, 'pageshow', warm);
  warm();
}
