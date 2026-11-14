let pending;

function loadMath() {
  if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
  if (!pending) pending = new Promise((resolve, reject) => {
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true, processEnvironments: true
      },
      svg: { fontCache: 'global' },
      startup: { typeset: false }
    };
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';
    script.async = true;
    script.onload = () => resolve(window.MathJax);
    script.onerror = () => { script.remove(); pending = null; reject(new Error('Math rendering unavailable')); };
    document.head.appendChild(script);
  });
  return pending;
}

export async function typesetArticle(container, enabled) {
  // `math: true/false` in the article record can override detection.
  const hasMath = /\$[^$]+\$|\\\(|\\\[|\\begin\{/.test(container.textContent);
  if (enabled === false || (enabled !== true && !hasMath)) return;
  const math = await loadMath();
  if (math.startup?.promise) await math.startup.promise;
  await math.typesetPromise([container]);
}
