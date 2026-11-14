import { divinationCopy } from './divination-copy.js';
import { storage } from './preferences.js';

export const DEFAULT_DIVINE_SERVER = 'https://phospheneser-awesome-academic-template.onrender.com';

export function resolveDivineServer(meta = {}) {
  return new URLSearchParams(globalThis.location?.search || '').get('serverUrl')
    || storage.get('divineServerUrl') || meta.divine?.serverUrl || DEFAULT_DIVINE_SERVER;
}

export function divineEndpoint(serverUrl, path, language = 'zh') {
  try {
    const url = new URL(serverUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path}`;
    url.search = ''; url.hash = '';
    return url;
  } catch { throw new Error(divinationCopy(language).invalidServer); }
}

export async function requestDivination({ serverUrl = DEFAULT_DIVINE_SERVER, type, query, useLLM = false, timeoutMs = 75000, signal, language = 'zh' }, fetcher = fetch) {
  const copy = divinationCopy(language);
  const url = divineEndpoint(serverUrl, 'divine', language);
  url.search = new URLSearchParams({ type, query, use_llm: String(useLLM) });
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    // GET has no JSON body. Avoid an unnecessary cross-origin preflight.
    const response = await fetcher(url.href, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    const text = await response.text(); // Keep the deadline until the body is complete.
    if (!response.ok) throw new Error(copy.httpError.replace('{status}', response.status));
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(copy.invalidResponse); }
    if (!data.success || typeof data.result !== 'string' || !data.result.trim()) throw new Error(copy.failed);
    return data.result + (data.philosophical_reply ? `\n\n--- ${copy.interpretation} ---\n${data.philosophical_reply}` : '')
      + (data.philosophical_reply_error ? `\n\n${copy.aiUnavailable}` : '');
  } catch (error) {
    if (timedOut) throw new Error(copy.timeout);
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof TypeError) throw new Error(copy.networkError);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
