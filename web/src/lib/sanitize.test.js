import { describe, expect, it } from 'vitest';
import { isSafeUrl, normalizeUrl, dialable } from './sanitize.js';

describe('isSafeUrl', () => {
  it.each([
    ['https://www.cgps.ntpc.edu.tw'],
    ['http://example.com'],
    ['https://school.ntpc.edu.tw/path?q=1&r=2#anchor'],
    ['HTTP://EXAMPLE.COM'],
    ['https://example.com:8080/'],
    ['https://user:pass@example.com/dashboard'],
    ['www.school.edu.tw'],
    ['school.edu.tw'],
    ['www.school.edu.tw/path?q=1'],
  ])('allows safe URL: %s', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['javascript:alert(document.cookie)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:MsgBox("xss")'],
    ['blob:https://example.com/some-uuid'],
    ['file:///etc/passwd'],
    ['ftp://example.com/pub/file.txt'],
  ])('rejects dangerous scheme: %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

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

  it.each([
    ['/relative/path'],
    ['://missing-scheme'],
    ['not a url at all'],
  ])('rejects malformed or relative URL: %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['http://example.com', 'http://example.com'],
    ['HTTP://EXAMPLE.COM', 'HTTP://EXAMPLE.COM'],
  ])('preserves an existing HTTP(S) URL: %s', (url, expected) => {
    expect(normalizeUrl(url)).toBe(expected);
  });

  it.each([
    ['www.school.edu.tw', 'https://www.school.edu.tw'],
    ['school.edu.tw', 'https://school.edu.tw'],
    ['www.school.edu.tw/path?q=1', 'https://www.school.edu.tw/path?q=1'],
  ])('prepends https:// to a bare domain: %s', (url, expected) => {
    expect(normalizeUrl(url)).toBe(expected);
  });

  it.each([
    ['javascript:alert(1)'],
    ['javascript:alert(document.cookie)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:MsgBox("xss")'],
    ['blob:https://example.com/some-uuid'],
  ])('rejects a dangerous scheme: %s', (url) => {
    expect(normalizeUrl(url)).toBeNull();
  });

  it.each([
    ['ftp://example.com'],
    ['file:///etc/passwd'],
  ])('rejects a non-http(s) scheme: %s', (url) => {
    expect(normalizeUrl(url)).toBeNull();
  });

  it.each([
    [''],
    [null],
    [undefined],
    ['   '],
    [42],
    [true],
  ])('returns null for non-string or empty input: %j', (url) => {
    expect(normalizeUrl(url)).toBeNull();
  });

  it.each([
    ['://missing-scheme'],
    ['not a url at all'],
    ['/relative/path'],
  ])('returns null for an unparseable or relative URL: %s', (url) => {
    expect(normalizeUrl(url)).toBeNull();
  });
});

describe('dialable', () => {
  it.each([
    ['02-12345678', '0212345678'],
    ['(02) 2345-6789', '0223456789'],
    ['+886-2-2345-6789', '+886223456789'],
    ['0912345678', '0912345678'],
  ])('extracts digits from plain phone: %s', (phone, expected) => {
    expect(dialable(phone)).toBe(expected);
  });

  it.each([
    ['(02) 2345-6789#302', '0223456789'],
    ['(02) 2345-6789\uFF03302', '0223456789'],
    ['(02) 2345-6789 \u5206\u6A5F 302', '0223456789'],
    ['(02) 2345-6789 ext 302', '0223456789'],
    ['(02) 2345-6789 ext. 302', '0223456789'],
    ['(02) 2345-6789 EXT 302', '0223456789'],
    ['02-23456789#', '0223456789'],
  ])('strips extension from phone: %s', (phone, expected) => {
    expect(dialable(phone)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    [42],
    [true],
  ])('returns null for non-string or empty input: %j', (phone) => {
    expect(dialable(phone)).toBeNull();
  });

  it('returns null when phone contains only non-digit characters', () => {
    expect(dialable('\u7121\u96FB\u8A71')).toBeNull();
  });
});
