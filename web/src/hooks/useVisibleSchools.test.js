import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisibleSchools } from './useVisibleSchools.js';

/* ------------------------------------------------------------------ */
/*  Mock react-leaflet                                                 */
/* ------------------------------------------------------------------ */

const listeners = {};

const mockBounds = {
  pad: vi.fn().mockReturnThis(),
  contains: vi.fn(),
};

const mockMap = {
  getZoom: vi.fn().mockReturnValue(12),
  getBounds: vi.fn().mockReturnValue(mockBounds),
  on: vi.fn((event, handler) => {
    listeners[event] = handler;
  }),
  off: vi.fn((event) => {
    delete listeners[event];
  }),
};

vi.mock('react-leaflet', () => ({
  useMap: () => mockMap,
}));

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const schools = [
  { id: '1', name: 'School A', position: [25.0, 121.5] },
  { id: '2', name: 'School B', position: [24.0, 120.5] },
  { id: '3', name: 'School C', position: [23.0, 119.5] },
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('useVisibleSchools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMap.getZoom.mockReturnValue(12);
    mockBounds.pad.mockReturnValue(mockBounds);
    mockBounds.contains.mockImplementation((pos) => pos[0] >= 24.0);
    mockMap.on.mockImplementation((event, handler) => {
      listeners[event] = handler;
    });
    mockMap.off.mockImplementation((event) => {
      delete listeners[event];
    });
    Object.keys(listeners).forEach((key) => delete listeners[key]);
  });

  it('returns schools within the current viewport', () => {
    const { result } = renderHook(() => useVisibleSchools(schools, 11));

    expect(result.current).toHaveLength(2);
    expect(result.current.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('pads the bounding box by the default padding value', () => {
    renderHook(() => useVisibleSchools(schools, 11));

    expect(mockBounds.pad).toHaveBeenCalledWith(0.25);
  });

  it('pads the bounding box by a custom padding value', () => {
    renderHook(() => useVisibleSchools(schools, 11, 0.5));

    expect(mockBounds.pad).toHaveBeenCalledWith(0.5);
  });

  it('returns an empty array below minZoom', () => {
    mockMap.getZoom.mockReturnValue(8);

    const { result } = renderHook(() => useVisibleSchools(schools, 11));

    expect(result.current).toEqual([]);
  });

  it('updates when the map fires moveend', () => {
    const { result } = renderHook(() => useVisibleSchools(schools, 11));
    expect(result.current).toHaveLength(2);

    mockMap.getZoom.mockReturnValue(9);
    act(() => {
      listeners.moveend?.();
    });

    expect(result.current).toEqual([]);
  });

  it('cleans up the moveend listener on unmount', () => {
    const { unmount } = renderHook(() => useVisibleSchools(schools, 11));

    expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    unmount();
    expect(mockMap.off).toHaveBeenCalledWith('moveend', expect.any(Function));
  });

  it('re-filters when the schools array changes', () => {
    const { result, rerender } = renderHook(
      ({ s }) => useVisibleSchools(s, 11),
      { initialProps: { s: schools } },
    );
    expect(result.current).toHaveLength(2);

    rerender({ s: [schools[2]] });
    expect(result.current).toHaveLength(0);
  });
});
