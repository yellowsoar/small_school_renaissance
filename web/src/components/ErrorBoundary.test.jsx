import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary, { RECOVERY_STABLE_MS } from './ErrorBoundary.jsx';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A component that throws on render, controllable via a module-scoped flag. */
let shouldThrow = false;
function Thrower() {
  if (shouldThrow) throw new Error('boom');
  return <p>all good</p>;
}

/**
 * Throws from a passive effect instead of render, so the recovered tree
 * commits before the error resurfaces (#487). Leaflet layers attach to the
 * map this way, e.g. HeatmapLayer.
 */
let effectShouldThrow = false;
function EffectThrower() {
  useEffect(() => {
    if (effectShouldThrow) throw new Error('effect boom');
  });
  return <p>effect ok</p>;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ErrorBoundary', () => {
  afterEach(() => {
    shouldThrow = false;
    effectShouldThrow = false;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Suppress React's noisy error-boundary console output. */
  const hush = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>hello world</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('shows error UI when a child throws', () => {
    hush();
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('畫面發生錯誤，無法繼續顯示。')).toBeTruthy();
  });

  it('shows a retry button with attempt count in error state', () => {
    hush();
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('重新嘗試（1/3）')).toBeTruthy();
  });

  it('recovers when retry button is clicked and the cause is gone', () => {
    hush();
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    // In error state
    expect(screen.getByRole('alert')).toBeTruthy();

    // Fix the cause, then click retry
    shouldThrow = false;
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('increments retry count on repeated failures', () => {
    hush();
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    // First error: button shows 1/3
    expect(screen.getByText('重新嘗試（1/3）')).toBeTruthy();

    // Click retry — still throwing, so re-caught
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));
    expect(screen.getByText('重新嘗試（2/3）')).toBeTruthy();

    // Click retry again
    fireEvent.click(screen.getByText('重新嘗試（2/3）'));
    expect(screen.getByText('重新嘗試（3/3）')).toBeTruthy();
  });

  it('shows escalation message after max retries exhausted', () => {
    hush();
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    // Exhaust all 3 retries
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));
    fireEvent.click(screen.getByText('重新嘗試（2/3）'));
    fireEvent.click(screen.getByText('重新嘗試（3/3）'));

    // Circuit breaker tripped: no more retry button
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText('已重試 3 次仍無法恢復，請重新整頁載入。'),
    ).toBeTruthy();
  });

  it('resets retry counter after successful recovery', () => {
    vi.useFakeTimers();
    hush();
    shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    // First error cycle: use one retry to recover
    expect(screen.getByText('重新嘗試（1/3）')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));

    // Recovered — children are back
    expect(screen.getByText('all good')).toBeTruthy();

    // Children stay healthy long enough for the breaker to reset (#487)
    act(() => vi.advanceTimersByTime(RECOVERY_STABLE_MS));

    // Second error cycle: trigger a new error via rerender
    shouldThrow = true;
    rerender(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    // Counter should be fresh 1/3, not carried-over 2/3
    expect(screen.getByText('重新嘗試（1/3）')).toBeTruthy();
  });

  it('trips the circuit breaker when the error is thrown from an effect (#487)', () => {
    hush();
    effectShouldThrow = true;

    render(
      <ErrorBoundary>
        <EffectThrower />
      </ErrorBoundary>,
    );

    // Each retry commits the children first, then the effect throws again.
    // The counter must keep climbing instead of being reset on commit.
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));
    fireEvent.click(screen.getByText('重新嘗試（2/3）'));
    fireEvent.click(screen.getByText('重新嘗試（3/3）'));

    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText('已重試 3 次仍無法恢復，請重新整頁載入。'),
    ).toBeTruthy();
  });

  it('keeps counting when the error returns before RECOVERY_STABLE_MS (#487)', () => {
    vi.useFakeTimers();
    hush();
    shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));
    expect(screen.getByText('all good')).toBeTruthy();

    // Fails again inside the stability window: not a real recovery.
    act(() => vi.advanceTimersByTime(RECOVERY_STABLE_MS - 1));
    shouldThrow = true;
    rerender(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('重新嘗試（2/3）')).toBeTruthy();
  });

  it('clears the pending reset timer on unmount (#487)', () => {
    vi.useFakeTimers();
    hush();
    shouldThrow = true;

    const { unmount } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByText('重新嘗試（1/3）'));
    expect(screen.getByText('all good')).toBeTruthy();

    const setStateSpy = vi.spyOn(ErrorBoundary.prototype, 'setState');
    unmount();
    act(() => vi.advanceTimersByTime(RECOVERY_STABLE_MS));

    expect(setStateSpy).not.toHaveBeenCalled();
  });
});
