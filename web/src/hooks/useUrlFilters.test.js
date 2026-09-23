import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUrlFilters } from './useUrlFilters.js';
import { MAP } from '../config/index.js';

describe('useUrlFilters', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('returns default filters from a clean URL', () => {
    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.year).toBe(130);
    expect(filters.counties.size).toBe(0);
    expect(filters.tiers.size).toBe(0);
    expect(filters.search).toBe('');
    expect(filters.zoom).toBe(MAP.zoom);
  });

  it('reads initial state from URL query params', () => {
    window.history.replaceState(
      null,
      '',
      '/?year=120&county=%E8%87%BA%E5%8C%97%E5%B8%82&tier=critical&q=%E5%9C%8B%E5%B0%8F',
    );

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.year).toBe(120);
    expect(filters.counties.has('臺北市')).toBe(true);
    expect(filters.tiers.has('critical')).toBe(true);
    expect(filters.search).toBe('國小');
  });

  it('reads multiple comma-separated counties from the URL', () => {
    window.history.replaceState(
      null,
      '',
      '/?county=%E8%87%BA%E5%8C%97%E5%B8%82,%E6%96%B0%E5%8C%97%E5%B8%82,%E5%8D%97%E6%8A%95%E7%B8%A3',
    );

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.counties.size).toBe(3);
    expect(filters.counties.has('臺北市')).toBe(true);
    expect(filters.counties.has('新北市')).toBe(true);
    expect(filters.counties.has('南投縣')).toBe(true);
  });

  it('falls back to defaults for out-of-range year', () => {
    window.history.replaceState(null, '', '/?year=999');

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.year).toBe(130);
  });

  it('ignores invalid tier names', () => {
    window.history.replaceState(null, '', '/?tier=nonexistent,critical');

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.tiers.has('critical')).toBe(true);
    expect(filters.tiers.has('nonexistent')).toBe(false);
  });

  it('update() merges a patch into current filters', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update] = result.current;
      update({ year: 118 });
    });

    expect(result.current[0].year).toBe(118);
  });

  it('syncs filter changes to the URL', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update] = result.current;
      update({ year: 118 });
    });

    expect(window.location.search).toContain('year=118');
  });

  it('omits default values from the URL', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update] = result.current;
      update({ year: 130 });
    });

    expect(window.location.search).toBe('');
  });

  it('reset keeps the current year but clears other filters', () => {
    window.history.replaceState(
      null,
      '',
      '/?year=120&county=%E8%87%BA%E5%8C%97%E5%B8%82&q=test',
    );

    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, , reset] = result.current;
      reset();
    });

    expect(result.current[0].year).toBe(120);
    expect(result.current[0].counties.size).toBe(0);
    expect(result.current[0].search).toBe('');
  });

  it('prunes unknown counties when knownCounties is provided', async () => {
    window.history.replaceState(
      null,
      '',
      '/?county=%E8%87%BA%E5%8C%97%E5%B8%82,%E4%B8%8D%E5%AD%98%E5%9C%A8',
    );

    const known = new Set(['臺北市', '新北市']);
    const { result } = renderHook(() => useUrlFilters(known));

    await waitFor(() => {
      expect(result.current[0].counties.has('不存在')).toBe(false);
    });
    expect(result.current[0].counties.has('臺北市')).toBe(true);
  });

  it('syncs filters on popstate (back/forward navigation)', () => {
    const { result } = renderHook(() => useUrlFilters());

    // Simulate the browser landing on a URL with filters via back/forward.
    window.history.replaceState(null, '', '/?year=118&q=烏來');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[0].year).toBe(118);
    expect(result.current[0].search).toBe('烏來');
  });

  it('survives replaceState throwing SecurityError without losing filter state (#210)', () => {
    const { result } = renderHook(() => useUrlFilters());

    // Stub replaceState to throw, simulating an overlong URL.
    const original = window.history.replaceState;
    window.history.replaceState = vi.fn(() => {
      throw new DOMException('SecurityError');
    });

    // Updating filters should not throw, even though replaceState does.
    act(() => {
      const [, update] = result.current;
      update({ year: 118, search: '插角' });
    });

    // In-memory filter state is preserved.
    expect(result.current[0].year).toBe(118);
    expect(result.current[0].search).toBe('插角');

    // Restore for other tests.
    window.history.replaceState = original;
  });

  it('syncs zoom to URL when changed (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update] = result.current;
      update({ zoom: 12 });
    });

    expect(result.current[0].zoom).toBe(12);
    expect(window.location.search).toContain('z=12');
  });

  it('omits z from URL when zoom is at default (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update] = result.current;
      update({ zoom: MAP.zoom });
    });

    expect(window.location.search).toBe('');
  });

  it('reads initial zoom from URL z param (#348)', () => {
    window.history.replaceState(null, '', '/?z=14');

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters.zoom).toBe(14);
  });

  it('syncs zoom on popstate navigation (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    window.history.replaceState(null, '', '/?z=15');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[0].zoom).toBe(15);
  });
});
