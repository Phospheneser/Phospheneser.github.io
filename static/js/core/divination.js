import { storage } from './preferences.js';

export const DEFAULT_DIVINE_SERVER = 'https://phospheneser-awesome-academic-template.onrender.com';

export function resolveDivineServer(meta = {}) {
  return new URLSearchParams(globalThis.location?.search || '').get('serverUrl')
    || storage.get('divineServerUrl') || meta.divine?.serverUrl || DEFAULT_DIVINE_SERVER;
}

export function divineEndpoint(serverUrl, path) {
  try {
    const url = new URL(serverUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path}`;
    url.search = ''; url.hash = '';
    return url;
  } catch { throw new Error('占卜服务地址无效，请检查服务配置。'); }
}

export async function requestDivination({ serverUrl = DEFAULT_DIVINE_SERVER, type, query, useLLM = false, timeoutMs = 75000, signal }, fetcher = fetch) {
  const url = divineEndpoint(serverUrl, 'divine');
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
    if (!response.ok) throw new Error(`占卜服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('服务尚未返回有效结果，可能正在启动，请稍后重试。'); }
    if (!data.success || typeof data.result !== 'string' || !data.result.trim()) throw new Error('服务未能完成本次占卜，请稍后重试或更换占卜方式。');
    return data.result + (data.philosophical_reply ? `\n\n--- 卦象解读 ---\n${data.philosophical_reply}` : '')
      + (data.philosophical_reply_error ? '\n\nAI 解读暂时不可用，以上为基础占卜结果。' : '');
  } catch (error) {
    if (timedOut) throw new Error('等待服务超时。服务可能正在唤醒或繁忙，请稍后重试。');
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof TypeError) throw new Error('无法连接占卜服务，请检查网络或稍后重试。');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
