/**
 * Size-limited body reader — environment-agnostic utility shared by
 * browser-side fetchWithTimeout and build-time fetchWithRetry.
 *
 * This module is intentionally free of DOM-only and Node-only APIs
 * so both runtimes can safely import it, following the same shared-module
 * pattern established by backoff.js and retry-core.js.
 *
 * @module body-reader
 */

/**
 * Read the full response body as text, enforcing a byte-size ceiling.
 *
 * When `maxBytes` is provided:
 * 1. Reject early if the Content-Length header exceeds the limit.
 * 2. Stream the body via `response.body.getReader()`, accumulating
 *    chunks and aborting when the cumulative size exceeds `maxBytes`.
 * 3. Fall back to `response.arrayBuffer()` + post-check when
 *    ReadableStream body is unavailable (e.g. mocked responses in
 *    tests).  Uses arrayBuffer() instead of text() so oversized
 *    responses are rejected without allocating the decoded string
 *    (peak memory O(n) vs O(2n)).
 *
 * When `maxBytes` is omitted or undefined, delegates to `response.text()`
 * with zero overhead (existing behavior).
 *
 * @param {Response} response  Fetch API Response (after classifyResponse)
 * @param {number} [maxBytes]  Optional byte-size ceiling
 * @returns {Promise<string>}  The response body as text
 * @throws {Error}             With `name: 'SizeLimitError'` and
 *                             `retriable: false` when the limit is exceeded
 */
export async function readBodyWithLimit(response, maxBytes) {
  // No limit requested — fast path, zero overhead.
  if (maxBytes == null) {
    return response.text();
  }

  // Early rejection via Content-Length header when available.
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(
      new Error(
        `Response size ${contentLength} bytes exceeds limit of ${maxBytes} bytes`,
      ),
      { name: 'SizeLimitError', retriable: false },
    );
  }

  // Streaming read with cumulative size check.
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      if (received > maxBytes) {
        reader.cancel();
        throw Object.assign(
          new Error(
            `Response size exceeds limit of ${maxBytes} bytes (received ${received}+ bytes)`,
          ),
          { name: 'SizeLimitError', retriable: false },
        );
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    return (
      chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
      decoder.decode()
    );
  }

  // Fallback: response.body is null (e.g. mocked Response in tests).
  // Use arrayBuffer() so oversized responses are rejected before
  // allocating the decoded text string (peak memory O(n) vs O(2n)).
  const buf = await response.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw Object.assign(
      new Error(
        `Response size ${buf.byteLength} bytes exceeds limit of ${maxBytes} bytes`,
      ),
      { name: 'SizeLimitError', retriable: false },
    );
  }
  return new TextDecoder().decode(buf);
}
