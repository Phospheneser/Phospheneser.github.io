import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDivination } from '../static/js/core/divination.js';

const request = { serverUrl: 'https://example.test/', type: 'Tarot', query: 'test' };

test('divination deadline covers the response body, not only headers', async () => {
  await assert.rejects(requestDivination({ ...request, timeoutMs: 15 }, async (url, { signal }) => ({
    ok: true,
    text: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })
  })), /超时/);
});

test('divination sends a simple GET without mandatory LLM or JSON preflight', async () => {
  const result = await requestDivination(request, async (url, options) => {
    assert.equal(new URL(url).pathname, '/divine');
    assert.equal(new URL(url).searchParams.get('use_llm'), 'false');
    assert.equal(options.headers['Content-Type'], undefined);
    return { ok: true, text: async () => JSON.stringify({ success: true, result: 'base', philosophical_reply_error: 'unavailable' }) };
  });
  assert.ok(result.startsWith('base'));
  assert.ok(result.includes('AI 解读暂时不可用'));
});

test('divination handles invalid responses and deliberate cancellation without simulated results', async () => {
  for (const response of [
    { ok: false, status: 503, text: async () => 'unavailable' },
    { ok: true, text: async () => '<html>Starting…</html>' },
    { ok: true, text: async () => '{"success":true}' }
  ]) await assert.rejects(requestDivination(request, async () => response));
  const controller = new AbortController();
  const pending = requestDivination({ ...request, signal: controller.signal }, (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
