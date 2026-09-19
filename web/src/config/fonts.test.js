import { describe, expect, it } from 'vitest';
import { GOOGLE_FONTS_URL } from './fonts.js';

describe('fonts config', () => {
  it('GOOGLE_FONTS_URL is a non-empty string', () => {
    expect(typeof GOOGLE_FONTS_URL).toBe('string');
    expect(GOOGLE_FONTS_URL.length).toBeGreaterThan(0);
  });

  it('GOOGLE_FONTS_URL points to Google Fonts with display=swap', () => {
    expect(GOOGLE_FONTS_URL).toMatch(/^https:\/\/fonts\.googleapis\.com\//);
    expect(GOOGLE_FONTS_URL).toContain('display=swap');
  });
});
