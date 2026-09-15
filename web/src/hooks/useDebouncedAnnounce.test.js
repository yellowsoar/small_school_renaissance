import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedAnnounce } from './useDebouncedAnnounce.js';

describe('useDebouncedAnnounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial text synchronously', () => {
    const { result } = renderHook(() => useDebouncedAnnounce('hello'));
    expect(result.current).toBe('hello');
  });

  it('does not update until the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useDebouncedAnnounce(text, 400),
      { initialProps: { text: 'a' } },
    );

    rerender({ text: 'b' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');
  });

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useDebouncedAnnounce(text, 400),
      { initialProps: { text: 'a' } },
    );

    rerender({ text: 'b' });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe('b');
  });

  it('resets the timer on rapid updates, only announcing the last value', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useDebouncedAnnounce(text, 400),
      { initialProps: { text: 'step-1' } },
    );

    // Simulate rapid slider steps
    rerender({ text: 'step-2' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ text: 'step-3' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ text: 'step-4' });
    act(() => vi.advanceTimersByTime(100));

    // Still showing initial value
    expect(result.current).toBe('step-1');

    // Wait for full delay after last change
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe('step-4');
  });

  it('respects a custom delay', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useDebouncedAnnounce(text, 1000),
      { initialProps: { text: 'original' } },
    );

    rerender({ text: 'updated' });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('original');

    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('updated');
  });

  it('cleans up the timer on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ text }) => useDebouncedAnnounce(text, 400),
      { initialProps: { text: 'first' } },
    );

    rerender({ text: 'second' });
    unmount();

    // Advancing timers after unmount should not throw
    act(() => vi.advanceTimersByTime(400));
    // result.current retains the last rendered value
    expect(result.current).toBe('first');
  });
});
