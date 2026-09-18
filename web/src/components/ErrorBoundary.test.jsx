import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A component that throws on render, controllable via a module-scoped flag. */
let shouldThrow = false;
function Thrower() {
  if (shouldThrow) throw new Error('boom');
  return <p>all good</p>;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ErrorBoundary', () => {
  afterEach(() => {
    shouldThrow = false;
    vi.restoreAllMocks();
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
});
