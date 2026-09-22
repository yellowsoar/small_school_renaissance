import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enforceTopFrame } from './frameGuard.js';

describe('enforceTopFrame', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root?.remove();
    // Restore window.top to the real value in case a test overrode it
    Object.defineProperty(window, 'top', {
      value: window.self,
      writable: true,
      configurable: true,
    });
  });

  it('does nothing when the page is the top frame', () => {
    // In the test environment window.top === window.self by default
    expect(() => enforceTopFrame()).not.toThrow();
    expect(root.textContent).toBe('');
  });

  it('replaces #root content and throws when framed', () => {
    Object.defineProperty(window, 'top', {
      value: {},
      writable: true,
      configurable: true,
    });

    expect(() => enforceTopFrame()).toThrow('frame');
    expect(root.textContent).toBe('此頁面不支援嵌入顯示');
  });

  it('throws even when #root element is missing', () => {
    root.remove();

    Object.defineProperty(window, 'top', {
      value: {},
      writable: true,
      configurable: true,
    });

    expect(() => enforceTopFrame()).toThrow('frame');
  });
});
