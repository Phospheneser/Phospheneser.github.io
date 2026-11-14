import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceWarmup } from '../static/js/core/service-warmup.js';

const server = 'https://example.test';
const healthy = () => ({ ok: true, json: async () => ({ success: true, status: 'ok' }) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('concurrent warmups share a request and recent successful checks expire', async () => {
  const response = deferred();
  let calls = 0, time = 1000;
  const warmup = createServiceWarmup({ now: () => time, readyTTL: 100, fetcher: async () => { calls++; return response.promise; } });
  const first = warmup.ensure(server);
  assert.equal(first, warmup.ensure(server + '/'));
  response.resolve(healthy());
  assert.equal(await first, true);
  await warmup.ensure(server);
  assert.equal(calls, 1);
  time += 101;
  await warmup.ensure(server);
  assert.equal(calls, 2, 'expired readiness is rechecked on the next visit');
  await warmup.ensure('https://another.example');
  assert.equal(calls, 3, 'different backends have separate readiness');
});

test('two browser tabs coordinate through a lock and a shared readiness record', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  let queue = Promise.resolve(), calls = 0;
  const locks = { request(name, options, callback) {
    const task = queue.then(callback); queue = task.catch(() => {}); return task;
  } };
  const response = deferred();
  const fetcher = async () => { calls++; return response.promise; };
  const tab1 = createServiceWarmup({ locks, storage, fetcher });
  const tab2 = createServiceWarmup({ locks, storage, fetcher });
  const tasks = [tab1.ensure(server), tab2.ensure(server)];
  response.resolve(healthy());
  assert.deepEqual(await Promise.all(tasks), [true, true]);
  assert.equal(calls, 1);
  assert.equal(tab2.isReady(server), true);
});

test('failed probes have a cooldown but can recover, and HTML is not ready', async () => {
  let time = 1000, calls = 0;
  const warmup = createServiceWarmup({ now: () => time, failureTTL: 100, fetcher: async () => {
    calls++;
    return calls === 1 ? { ok: true, json: async () => { throw new SyntaxError('HTML startup page'); } } : healthy();
  } });
  assert.equal(await warmup.ensure(server), false);
  assert.equal(await warmup.ensure(server), false);
  assert.equal(calls, 1);
  time += 101;
  assert.equal(await warmup.ensure(server), true);
  assert.equal(calls, 2);
});

test('probe deadline includes the body and releases in-flight state', async () => {
  const warmup = createServiceWarmup({ timeoutMs: 10, failureTTL: 0, fetcher: async (url, { signal }) => ({
    ok: true, json: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })
  }) });
  assert.equal(await warmup.ensure(server), false);
  assert.equal(await warmup.ensure(server), false, 'a timed-out promise is not permanently cached');
});

test('restricted storage and locks fall back to one check per page', async () => {
  let calls = 0;
  const unavailable = () => { throw new Error('Unavailable'); };
  const warmup = createServiceWarmup({ storage: { getItem: unavailable, setItem: unavailable },
    locks: { request: unavailable }, fetcher: async () => { calls++; return healthy(); } });
  assert.equal(await warmup.ensure(server), true);
  assert.equal(await warmup.ensure(server), true);
  assert.equal(calls, 1);
  assert.equal(await warmup.ensure('invalid address'), false);
});

test('a successful business request wins over an older failed health probe', async () => {
  const response = deferred();
  const entered = deferred();
  const warmup = createServiceWarmup({ fetcher: async () => { entered.resolve(); return response.promise; } });
  const probe = warmup.ensure(server);
  await entered.promise;
  warmup.noteReady(server);
  response.resolve({ ok: false });
  assert.equal(await probe, true);
  assert.equal(warmup.isReady(server), true);
});
