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
    const [filters, , , view] = result.current;

    expect(filters.year).toBe(130);
    expect(filters.counties.size).toBe(0);
    expect(filters.tiers.size).toBe(0);
    expect(filters.search).toBe('');
    expect(view.zoom).toBe(MAP.zoom);
    expect(view.excludeClosed).toBe(true);
  });

  it('keeps view state out of the filters object (#478)', () => {
    window.history.replaceState(null, '', '/?z=13&closed=1');

    const { result } = renderHook(() => useUrlFilters());
    const [filters] = result.current;

    expect(filters).not.toHaveProperty('zoom');
    expect(filters).not.toHaveProperty('excludeClosed');
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

  it('reset keeps zoom and the closed-school toggle (#472)', () => {
    window.history.replaceState(
      null,
      '',
      '/?z=13&county=%E8%87%BA%E5%8C%97%E5%B8%82&q=test&closed=1',
    );

    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, , reset] = result.current;
      reset();
    });

    expect(result.current[3].zoom).toBe(13);
    expect(result.current[3].excludeClosed).toBe(false);
    expect(result.current[0].counties.size).toBe(0);
    expect(result.current[0].search).toBe('');
    expect(window.location.search).toBe('?closed=1&z=13');
  });

  it('reset does not produce a new view object (#478)', () => {
    window.history.replaceState(null, '', '/?z=13&q=test');

    const { result } = renderHook(() => useUrlFilters());
    const viewBefore = result.current[3];

    act(() => {
      const [, , reset] = result.current;
      reset();
    });

    expect(result.current[3]).toBe(viewBefore);
  });

  it('updateView() does not produce a new filters object (#478)', () => {
    const { result } = renderHook(() => useUrlFilters());
    const filtersBefore = result.current[0];

    act(() => {
      const [, , , , updateView] = result.current;
      updateView({ zoom: 12 });
    });

    expect(result.current[3].zoom).toBe(12);
    expect(result.current[0]).toBe(filtersBefore);
  });

  it('keeps both groups in the URL when they change in the same tick (#478)', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, update, , , updateView] = result.current;
      update({ year: 118 });
      updateView({ zoom: 12, excludeClosed: false });
    });

    expect(window.location.search).toBe('?year=118&closed=1&z=12');
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

  it('restores filters and view together on popstate (#478)', () => {
    const { result } = renderHook(() => useUrlFilters());

    window.history.replaceState(null, '', '/?year=118&closed=1&z=12');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[0].year).toBe(118);
    expect(result.current[3]).toEqual({ zoom: 12, excludeClosed: false });
  });

  it('survives replaceState throwing SecurityError without losing filter state (#210)', () => {
    const { result } = renderHook(() => useUrlFilters());

    // Stub replaceState to throw, simulating an overlong URL.
    const original = window.history.replaceState;
    window.history.replaceState = vi.fn(() => {
      throw new DOMException('SecurityError');
    });

    // Updating should not throw, even though replaceState does.
    act(() => {
      const [, update, , , updateView] = result.current;
      update({ year: 118, search: '插角' });
      updateView({ zoom: 12 });
    });

    // In-memory state is preserved.
    expect(result.current[0].year).toBe(118);
    expect(result.current[0].search).toBe('插角');
    expect(result.current[3].zoom).toBe(12);

    // Restore for other tests.
    window.history.replaceState = original;
  });

  it('logs a warning when replaceState throws (#382)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = window.history.replaceState;
    window.history.replaceState = vi.fn(() => {
      throw new DOMException('SecurityError');
    });

    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      const [, update] = result.current;
      update({ year: 118 });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[useUrlFilters] replaceState failed:',
      'SecurityError',
    );

    window.history.replaceState = original;
    warnSpy.mockRestore();
  });

  it('syncs zoom to URL when changed (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, , , , updateView] = result.current;
      updateView({ zoom: 12 });
    });

    expect(result.current[3].zoom).toBe(12);
    expect(window.location.search).toContain('z=12');
  });

  it('omits z from URL when zoom is at default (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      const [, , , , updateView] = result.current;
      updateView({ zoom: MAP.zoom });
    });

    expect(window.location.search).toBe('');
  });

  it('reads initial zoom from URL z param (#348)', () => {
    window.history.replaceState(null, '', '/?z=14');

    const { result } = renderHook(() => useUrlFilters());
    const [, , , view] = result.current;

    expect(view.zoom).toBe(14);
  });

  it('syncs zoom on popstate navigation (#348)', () => {
    const { result } = renderHook(() => useUrlFilters());

    window.history.replaceState(null, '', '/?z=15');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[3].zoom).toBe(15);
  });
});
