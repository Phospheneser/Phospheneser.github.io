// Optional animation runs only while visible, on the active page, and permitted
// by the visitor's motion preference. All observers/listeners share its scope.
export function observeActivity(element, scope, update) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = !window.IntersectionObserver;
  let suspended = false;
  let previous;
  const refresh = () => {
    const active = visible && !document.hidden && !motion.matches && !suspended;
    if (active !== previous) { previous = active; update(active); }
  };
  if (window.IntersectionObserver) {
    const observer = new window.IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      refresh();
    });
    observer.observe(element);
    scope.add(() => observer.disconnect());
  }
  scope.on(document, 'visibilitychange', refresh);
  if (motion.addEventListener) scope.on(motion, 'change', refresh);
  scope.on(window, 'pagehide', () => { suspended = true; refresh(); });
  scope.on(window, 'pageshow', () => { suspended = false; refresh(); });
  scope.add(() => { suspended = true; refresh(); });
  refresh();
}
