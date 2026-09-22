import { describe, expect, it, vi } from 'vitest';
import { readBodyWithLimit } from './body-reader.js';

describe('readBodyWithLimit', () => {
  /* ------------------------------------------------------------ */
  /*  Fast path: maxBytes omitted                                    */
  /* ------------------------------------------------------------ */

  it('delegates to response.text() when maxBytes is null', async () => {
    const mockRes = {
      text: vi.fn().mockResolvedValue('hello'),
      headers: new Headers(),
      body: null,
    };

    const result = await readBodyWithLimit(mockRes, null);
    expect(result).toBe('hello');
    expect(mockRes.text).toHaveBeenCalledTimes(1);
  });

  it('delegates to response.text() when maxBytes is undefined', async () => {
    const mockRes = {
      text: vi.fn().mockResolvedValue('hello'),
      headers: new Headers(),
      body: null,
    };

    const result = await readBodyWithLimit(mockRes);
    expect(result).toBe('hello');
    expect(mockRes.text).toHaveBeenCalledTimes(1);
  });

  /* ------------------------------------------------------------ */
  /*  Content-Length early rejection                                  */
  /* ------------------------------------------------------------ */

  it('rejects early when Content-Length exceeds maxBytes', async () => {
    const mockRes = {
      headers: new Headers({ 'Content-Length': '20000' }),
      body: null,
      text: vi.fn(),
      arrayBuffer: vi.fn(),
    };

    await expect(readBodyWithLimit(mockRes, 1000)).rejects.toMatchObject({
      name: 'SizeLimitError',
      retriable: false,
    });

    // Body should never be read.
    expect(mockRes.text).not.toHaveBeenCalled();
    expect(mockRes.arrayBuffer).not.toHaveBeenCalled();
  });

  /* ------------------------------------------------------------ */
  /*  Streaming read: abort on oversize                               */
  /* ------------------------------------------------------------ */

  it('aborts streaming read when cumulative size exceeds maxBytes', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('x'.repeat(60)),
      encoder.encode('x'.repeat(60)),
    ];
    let i = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (i < chunks.length) {
          controller.enqueue(chunks[i++]);
        } else {
          controller.close();
        }
      },
    });
    const mockRes = new Response(stream, {
      status: 200,
      statusText: 'OK',
    });

    await expect(readBodyWithLimit(mockRes, 100)).rejects.toMatchObject({
      name: 'SizeLimitError',
      retriable: false,
    });
  });

  /* ------------------------------------------------------------ */
  /*  Streaming read: within limit                                    */
  /* ------------------------------------------------------------ */

  it('returns body text when streaming size is within maxBytes', async () => {
    const body = 'small CSV content';
    const mockRes = new Response(body, {
      status: 200,
      statusText: 'OK',
    });

    const text = await readBodyWithLimit(mockRes, 10_000);
    expect(text).toBe(body);
  });

  /* ------------------------------------------------------------ */
  /*  Fallback path (body: null) with arrayBuffer()                   */
  /* ------------------------------------------------------------ */

  it('rejects via fallback when body is null and size exceeds maxBytes', async () => {
    const largeText = 'x'.repeat(200);
    const encoded = new TextEncoder().encode(largeText);
    const mockRes = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: null,
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
    };

    await expect(readBodyWithLimit(mockRes, 100)).rejects.toMatchObject({
      name: 'SizeLimitError',
      retriable: false,
    });

    expect(mockRes.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('returns text via fallback when body is null and size is within maxBytes', async () => {
    const smallText = 'small CSV';
    const encoded = new TextEncoder().encode(smallText);
    const mockRes = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: null,
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
    };

    const text = await readBodyWithLimit(mockRes, 10_000);
    expect(text).toBe(smallText);
    expect(mockRes.arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
