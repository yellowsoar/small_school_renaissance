/**
 * Shared Intl.NumberFormat instances for zh-Hant-TW locale.
 *
 * Centralised here so every component uses the same formatter objects
 * and locale changes only need to happen in one place.
 */

export const integer = new Intl.NumberFormat('zh-Hant-TW');

export const percent = new Intl.NumberFormat('zh-Hant-TW', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
