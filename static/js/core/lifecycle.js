export function createScope() {
  const cleanups = [];
  return {
    add(cleanup) { if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup; },
    on(target, event, listener, options) {
      target.addEventListener(event, listener, options);
      cleanups.push(() => target.removeEventListener(event, listener, options));
    },
    interval(callback, delay) { const id = setInterval(callback, delay); cleanups.push(() => clearInterval(id)); },
    destroy() { while (cleanups.length) cleanups.pop()(); }
  };
}
