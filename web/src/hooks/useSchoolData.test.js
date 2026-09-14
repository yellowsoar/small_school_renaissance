import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSchoolData } from './useSchoolData.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { parseSchools } from '../lib/schools.js';

vi.mock('../lib/fetchWithTimeout.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../lib/schools.js', () => ({
  parseSchools: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const mockSchools = [
  { id: '1', name: '測試國小', county: '臺北市', position: [25.0, 121.5] },
];
const mockCounties = ['臺北市'];

describe('useSchoolData', () => {
  it('starts in loading state', () => {
    fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    expect(result.current.status).toBe('loading');
    expect(result.current.schools).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('transitions to ready on successful fetch', async () => {
    fetchWithTimeout.mockResolvedValue({
      text: () => Promise.resolve('csv-content'),
    });
    parseSchools.mockReturnValue({ schools: mockSchools, counties: mockCounties });

    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.schools).toEqual(mockSchools);
    expect(result.current.counties).toEqual(mockCounties);
    expect(result.current.error).toBeNull();
  });

  it('transitions to error on fetch failure', async () => {
    fetchWithTimeout.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('資料載入失敗');
  });

  it('shows timeout message on TimeoutError', async () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    fetchWithTimeout.mockRejectedValue(err);

    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toBe(
      '資料載入逾時，請檢查網路連線後重新載入',
    );
  });

  it('transitions to error when parseSchools throws', async () => {
    fetchWithTimeout.mockResolvedValue({
      text: () => Promise.resolve('bad-csv'),
    });
    parseSchools.mockImplementation(() => {
      throw new TypeError('Unexpected column header');
    });

    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toContain('資料載入失敗');
    expect(result.current.error.message).toContain('Unexpected column header');
  });

  it('re-fetches when the URL changes', async () => {
    fetchWithTimeout.mockResolvedValue({
      text: () => Promise.resolve('csv'),
    });
    parseSchools.mockReturnValue({ schools: mockSchools, counties: mockCounties });

    const { result, rerender } = renderHook(
      ({ url }) => useSchoolData(url),
      { initialProps: { url: '/a.csv' } },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

    rerender({ url: '/b.csv' });

    await waitFor(() => expect(fetchWithTimeout).toHaveBeenCalledTimes(2));
    expect(fetchWithTimeout.mock.calls[1][0]).toBe('/b.csv');
  });

  it('reload triggers a new fetch attempt', async () => {
    fetchWithTimeout
      .mockRejectedValueOnce(new TypeError('fail'))
      .mockResolvedValueOnce({ text: () => Promise.resolve('csv') });
    parseSchools.mockReturnValue({ schools: mockSchools, counties: mockCounties });

    const { result } = renderHook(() => useSchoolData('/fake.csv'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('passes AbortSignal for cleanup on unmount', () => {
    fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useSchoolData('/fake.csv'));

    const [, opts] = fetchWithTimeout.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.signal.aborted).toBe(false);

    unmount();
    expect(opts.signal.aborted).toBe(true);
  });

  it('exposes a reload callback', () => {
    fetchWithTimeout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSchoolData('/fake.csv'));

    expect(typeof result.current.reload).toBe('function');
  });
});
