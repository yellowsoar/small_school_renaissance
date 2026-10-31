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

  /* ---------------------------------------------------------------- */
  /*  Deferred loading (#493)                                          */
  /* ---------------------------------------------------------------- */

  it('stays idle without fetching or retrying before first enable (#493)', () => {
    mocks.fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ url }) => useGeoJson(url, { enabled: false }),
      { initialProps: { url: '/first.geojson' } },
    );
    expect(result.current).toMatchObject({ status: 'idle', data: null, error: null });
    act(() => result.current.reload());
    rerender({ url: '/second.geojson' });
    expect(result.current.status).toBe('idle');
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('starts on first enable and retains the same request across in-flight toggles (#493)', async () => {
    let resolve;
    mocks.fetchWithTimeout.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useGeoJson('/test.geojson', { enabled }),
      { initialProps: { enabled: false } },
    );
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(result.current.status).toBe('loading');
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1);
    const signal = mocks.fetchWithTimeout.mock.calls[0][1].signal;
    expect(mocks.fetchWithTimeout.mock.calls[0][1].maxBytes).toBe(5 * 1024 * 1024);
    rerender({ enabled: false });
    rerender({ enabled: true });
    rerender({ enabled: false });
    expect(signal.aborted).toBe(false);
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1);
    await act(async () => resolve(JSON.stringify(MOCK_GEOJSON)));
    expect(result.current.status).toBe('ready');
    const cached = result.current.data;
    rerender({ enabled: true });
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(result.current.data).toBe(cached);
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('keeps failures across toggles until an explicit retry succeeds (#493)', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(JSON.stringify(MOCK_GEOJSON));
    const { result, rerender } = renderHook(
      ({ enabled }) => useGeoJson('/test.geojson', { enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(result.current.status).toBe('error');
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('aborts an active deferred request on unmount and ignores its late completion (#493)', async () => {
    let resolve;
    mocks.fetchWithTimeout.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useGeoJson('/test.geojson', { enabled }),
      { initialProps: { enabled: false } },
    );
    rerender({ enabled: true });
    const signal = mocks.fetchWithTimeout.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(JSON.stringify(MOCK_GEOJSON)));
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
  });

  it('refetches a changed URL after activation, aborting the previous request (#493)', async () => {
    let finishOld;
    mocks.fetchWithTimeout.mockReturnValueOnce(new Promise((done) => { finishOld = done; }))
      .mockResolvedValueOnce(JSON.stringify(MOCK_GEOJSON));
    const { result, rerender } = renderHook(
      ({ url, enabled }) => useGeoJson(url, { enabled }),
      { initialProps: { url: '/old.geojson', enabled: true } },
    );
    const oldSignal = mocks.fetchWithTimeout.mock.calls[0][1].signal;
    rerender({ url: '/new.geojson', enabled: false });
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const current = result.current.data;
    await act(async () => finishOld(JSON.stringify({ type: 'FeatureCollection', features: [] })));
    expect(result.current.data).toBe(current);
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(mocks.fetchWithTimeout.mock.calls[1][0]).toBe('/new.geojson');
  });
});
