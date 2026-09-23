import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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

  it('does not update state after unmount', async () => {
    let resolvePromise;
    mocks.fetchWithTimeout.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useGeoJson('/test.geojson'));
    unmount();

    // Resolve after unmount \u2014 should not throw or update state
    resolvePromise(JSON.stringify(MOCK_GEOJSON));

    // State should remain at loading (the initial state before unmount)
    expect(result.current.status).toBe('loading');
  });
});
