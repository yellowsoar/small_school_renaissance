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
 * @throws {Error} If the page is loaded in a frame.
 */
export function enforceTopFrame() {
  if (window.top === window.self) return;

  const root = document.getElementById('root');
  if (root) {
    root.textContent = '此頁面不支援嵌入顯示';
  }
  throw new Error(
    'Blocked: page loaded inside a frame (clickjacking protection)',
  );
}
