/**
 * Validates that a URL string uses a safe scheme (http: or https:).
 *
 * Prevents XSS via javascript:, data:, vbscript: and other dangerous
 * schemes when rendering user-supplied or upstream-sourced URLs as
 * href attributes.
 *
 * @param {*} url - any value; non-strings are rejected gracefully.
 * @returns {boolean}
 */
export const isSafeUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};
