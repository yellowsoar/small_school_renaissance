import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A component that throws on render, controllable via props. */
function Thrower({ shouldThrow = true }) {
  if (shouldThrow) throw new Error('boom');
  return <p>all good</p>;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ErrorBoundary', () => {
  // Suppress the noisy error boundary console output during tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>hello world</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('shows error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('\u756b\u9762\u767c\u751f\u932f\u8aa4\uff0c\u7121\u6cd5\u7e7c\u7e8c\u986f\u793a\u3002')).toBeTruthy();
  });

  it('shows a retry button in error state', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('\u91cd\u65b0\u5617\u8a66')).toBeTruthy();
  });

  it('recovers when retry button is clicked and child stops throwing', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Thrower shouldThrow />
      </ErrorBoundary>,
    );

    // In error state
    expect(screen.getByRole('alert')).toBeTruthy();

    // Re-render with non-throwing child before clicking retry
    rerender(
      <ErrorBoundary>
        <Thrower shouldThrow={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('\u91cd\u65b0\u5617\u8a66'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('all good')).toBeTruthy();
  });
});
