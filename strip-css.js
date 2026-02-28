// Injected into every page before page scripts run.
// Strips all CSS, images, and visual-only elements — leaves plain text.
(function () {
  const VISUAL_SELECTORS = [
    'style',
    'link[rel="stylesheet"]',
    'img',
    'svg',
    'video',
    'audio',
    'canvas',
    'picture',
    'iframe',
    'nav',
  ].join(', ');

  const VISUAL_TAGS = new Set([
    'STYLE', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS', 'PICTURE', 'IFRAME', 'NAV',
  ]);

  function stripVisuals() {
    document.querySelectorAll(VISUAL_SELECTORS).forEach(el => el.remove());

    // Remove background images set via inline style
    document.querySelectorAll('[style]').forEach(el => {
      el.style.backgroundImage = 'none';
      el.style.background = 'none';
    });
  }

  if (document.readyState !== 'loading') {
    stripVisuals();
  } else {
    document.addEventListener('DOMContentLoaded', stripVisuals);
  }

  // Watch for visuals injected dynamically after load
  new MutationObserver(mutations => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        if (VISUAL_TAGS.has(node.nodeName)) {
          node.remove();
        } else if (node.nodeName === 'LINK' && node.rel === 'stylesheet') {
          node.remove();
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
