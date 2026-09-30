import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGeoJson } from './useGeoJson.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const MOCK_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121, 24] },
      properties: { name: 'test' },
    },
  ],
};

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../lib/fetchWithTimeout.js', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('useGeoJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    mocks.fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches and parses GeoJSON on mount', async () => {
    mocks.fetchWithTimeout.mockResolvedValue(JSON.stringify(MOCK_GEOJSON));

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(MOCK_GEOJSON);
    expect(result.current.error).toBeNull();
  });

  it('passes abort signal to fetchWithTimeout', () => {
    mocks.fetchWithTimeout.mockResolvedValue(JSON.stringify(MOCK_GEOJSON));

    renderHook(() => useGeoJson('/test.geojson'));

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      '/test.geojson',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('transitions to error state on fetch failure', async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('network error');
  });

  it('transitions to error state on invalid JSON', async () => {
    mocks.fetchWithTimeout.mockResolvedValue('not json {{{');

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('transitions to error state on valid JSON but invalid GeoJSON (#356)', async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      JSON.stringify({ type: 'Topology', objects: {} }),
    );

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('FeatureCollection');
  });

  it('rejects JSON array (missing FeatureCollection wrapper) (#356)', async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      JSON.stringify([{ type: 'Feature' }]),
    );

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('FeatureCollection');
  });

  it('does not update state after unmount', async () => {
    let resolvePromise;
    mocks.fetchWithTimeout.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useGeoJson('/test.geojson'));
    unmount();

    // Resolve after unmount — should not throw or update state
    resolvePromise(JSON.stringify(MOCK_GEOJSON));

    // State should remain at loading (the initial state before unmount)
    expect(result.current.status).toBe('loading');
  });

  /* ---------------------------------------------------------------- */
  /*  reload (#365)                                                    */
  /* ---------------------------------------------------------------- */

  it('exposes reload callback', () => {
    mocks.fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGeoJson('/test.geojson'));
    expect(typeof result.current.reload).toBe('function');
  });

  it('reload resets error state and retries fetch (#365)', async () => {
    mocks.fetchWithTimeout
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(JSON.stringify(MOCK_GEOJSON));

    const { result } = renderHook(() => useGeoJson('/test.geojson'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(MOCK_GEOJSON);
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('reload resets ready state back to loading (#365)', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(JSON.stringify(MOCK_GEOJSON));

    const { result } = renderHook(() => useGeoJson('/test.geojson'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mocks.fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  Error classification (#459)                                      */
  /* ---------------------------------------------------------------- */

  it('classifies TimeoutError with timeout-specific message (#459)', async () => {
    const err = new Error('Request timed out after 30000ms');
    err.name = 'TimeoutError';
    mocks.fetchWithTimeout.mockRejectedValue(err);

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('\u8f09\u5165\u903e\u6642');
    expect(result.current.error.cause).toBe(err);
  });

  it('classifies SizeLimitError with size-specific message (#459)', async () => {
    const err = new Error('5242880 bytes');
    err.name = 'SizeLimitError';
    mocks.fetchWithTimeout.mockRejectedValue(err);

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('\u5927\u5c0f\u8d85\u904e\u4e0a\u9650');
    expect(result.current.error.cause).toBe(err);
  });

  it('classifies post-download parse failure as "\u89e3\u6790\u5931\u6557" (#459)', async () => {
    // fetchWithTimeout resolves (downloadComplete = true), then JSON.parse fails
    mocks.fetchWithTimeout.mockResolvedValue('not json {{{');

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('\u89e3\u6790\u5931\u6557');
  });

  it('classifies pre-download failure as "\u8f09\u5165\u5931\u6557" (#459)', async () => {
    // fetchWithTimeout rejects (downloadComplete = false)
    mocks.fetchWithTimeout.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useGeoJson('/test.geojson'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('\u8f09\u5165\u5931\u6557');
    expect(result.current.error.message).toContain('network error');
  });
});
