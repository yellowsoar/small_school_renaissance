import { describe, expect, it } from 'vitest';
import { isSafeUrl } from './sanitize.js';

describe('isSafeUrl', () => {
  // --- safe URLs ---------------------------------------------------------

  it.each([
    ['https://www.cgps.ntpc.edu.tw'],
    ['http://example.com'],
    ['https://school.ntpc.edu.tw/path?q=1&r=2#anchor'],
    ['HTTP://EXAMPLE.COM'],
    ['https://example.com:8080/'],
  ])('allows safe URL: %s', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  // --- dangerous schemes (regression for #3) -----------------------------

  it.each([
    ['javascript:alert(1)'],
    ['javascript:alert(document.cookie)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:MsgBox("xss")'],
    ['blob:https://example.com/some-uuid'],
  ])('rejects dangerous scheme: %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  // --- non-string / empty ------------------------------------------------

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    [42],
    [true],
  ])('rejects non-string or empty input: %j', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  // --- malformed / relative ----------------------------------------------

  it.each([
    ['/relative/path'],
    ['example.com'],
    ['://missing-scheme'],
    ['not a url at all'],
  ])('rejects malformed or relative URL: %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});
