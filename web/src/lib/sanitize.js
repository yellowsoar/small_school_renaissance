/**
 * Normalizes a URL string by prepending https:// when no protocol scheme
 * is present, then validates that the result uses a safe scheme
 * (http: or https:).
 *
 * Upstream CSV data from the Ministry of Education sometimes omits the
 * protocol prefix (e.g. "www.school.edu.tw" instead of
 * "https://www.school.edu.tw"). This function ensures such URLs are
 * usable while still blocking dangerous schemes.
 *
 * @param {*} url - any value; non-strings are rejected gracefully.
 * @returns {string|null} The normalized URL if safe, or null.
 */
export const normalizeUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return null;
  // If the URL already has a scheme with ://, keep it as-is so that
  // non-http(s) schemes (ftp://, file://) fail the protocol check below
  // instead of being mangled into https://ftp://...
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    const isSafeProtocol = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    // A leading slash would otherwise produce a hostless URL such as
    // https:///relative/path, which is not a valid external website URL.
    return isSafeProtocol && parsed.hostname ? normalized : null;
  } catch {
    return null;
  }
};

/**
 * Validates that a URL string uses a safe scheme (http: or https:).
 * URLs without a protocol prefix are treated as https://.
 *
 * Prevents XSS via javascript:, data:, vbscript: and other dangerous
 * schemes when rendering user-supplied or upstream-sourced URLs as
 * href attributes.
 *
 * @param {*} url - any value; non-strings are rejected gracefully.
 * @returns {boolean}
 */
export const isSafeUrl = (url) => normalizeUrl(url) !== null;
