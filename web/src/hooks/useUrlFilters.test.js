import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUrlFilters } from './useUrlFilters.js';

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
});
