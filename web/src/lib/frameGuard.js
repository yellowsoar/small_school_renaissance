/**
 * Frame-busting mitigation against clickjacking.
 *
 * CSP frame-ancestors cannot be set via <meta> tag (CSP Level 2 spec),
 * and GitHub Pages does not support custom HTTP response headers.
 * This JS defense is the best-effort protection available within the
 * current hosting constraint. See #315.
 */

/**
 * Prevent the app from rendering inside a frame.
 *
 * When the page is loaded in an iframe/object/embed, replaces the
 * #root element's content with a warning and throws to halt module
 * evaluation (preventing React from mounting).
 *
 * The `window.top === window.self` comparison is wrapped in try-catch as
 * a defensive measure only: per the HTML spec, `top` and `self` are
 * cross-origin accessible and should never throw. If a non-conforming
 * environment does throw, the page is treated as framed (fail-closed).
 * See #467.
 *
 * @throws {Error} If the page is loaded in a frame.
 */
export function enforceTopFrame() {
  let isTop = false;
  try {
    isTop = window.top === window.self;
  } catch {
    // Per HTML spec, `top`/`self` are cross-origin accessible and should
    // not throw. Defensive guard for non-conforming environments:
    // treat any access failure as framed (fail-closed). See #467.
  }
  if (isTop) return;

  const root = document.getElementById('root');
  if (root) {
    root.textContent = '此頁面不支援嵌入顯示';
  }
  throw new Error(
    'Blocked: page loaded inside a frame (clickjacking protection)',
  );
}
