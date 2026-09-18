import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import SummaryBar from './SummaryBar.jsx';
import { RISK_TIERS } from '../config/index.js';

const AT_RISK_MAX = RISK_TIERS.find((t) => t.id === 'high').max;

const baseTotals = { schools: 2634, closing: 42, atRisk: 187, students: 98765, unprojected: 0 };

/** Helper that supplies every required prop with sensible defaults. */
const renderBar = (overrides = {}) => {
  const props = {
    totals: baseTotals,
    year: 130,
    closingCount: 42,
    excludeClosed: false,
    onToggleClosed: vi.fn(),
    ...overrides,
  };
  return { ...render(<SummaryBar {...props} />), props };
};

describe('SummaryBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('displays formatted summary statistics', () => {
    renderBar();

    expect(screen.getByText('2,634')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('187')).toBeTruthy();
    expect(screen.getByText('98,765')).toBeTruthy();
  });

  it('shows correct labels including the selected year', () => {
    renderBar({ year: 125 });

    expect(screen.getByText('符合條件學校')).toBeTruthy();
    expect(screen.getByText('125 學年推估歸零')).toBeTruthy();
    expect(screen.getByText(`${AT_RISK_MAX} 人以下（含歸零）`)).toBeTruthy();
    expect(screen.getByText('推估學生總數')).toBeTruthy();
  });

  it('uses a hidden live region instead of aria-live on the dl', () => {
    const { container } = renderBar();

    // The visible <dl> should no longer have aria-live
    const dl = container.querySelector('dl');
    expect(dl.getAttribute('aria-live')).toBeNull();
    expect(dl.getAttribute('aria-atomic')).toBeNull();

    // A separate hidden div carries the live region
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.classList.contains('sr-only')).toBe(true);
    expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
  });

  it('debounces the live region text (not updated before delay)', () => {
    const { container, rerender } = render(
      <SummaryBar
        totals={baseTotals}
        year={125}
        closingCount={42}
        excludeClosed={false}
        onToggleClosed={() => {}}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    const initialText = liveRegion.textContent;

    // Re-render with a different year (simulating slider move)
    const newTotals = { ...baseTotals, closing: 50 };
    rerender(
      <SummaryBar
        totals={newTotals}
        year={126}
        closingCount={50}
        excludeClosed={false}
        onToggleClosed={() => {}}
      />,
    );

    // Before the debounce delay, the live region should still hold old text
    act(() => vi.advanceTimersByTime(200));
    expect(liveRegion.textContent).toBe(initialText);
  });

  it('updates the live region text after the debounce delay', () => {
    const { container, rerender } = render(
      <SummaryBar
        totals={baseTotals}
        year={125}
        closingCount={42}
        excludeClosed={false}
        onToggleClosed={() => {}}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');

    const newTotals = { schools: 100, closing: 10, atRisk: 30, students: 5000, unprojected: 0 };
    rerender(
      <SummaryBar
        totals={newTotals}
        year={126}
        closingCount={10}
        excludeClosed={false}
        onToggleClosed={() => {}}
      />,
    );

    act(() => vi.advanceTimersByTime(400));
    expect(liveRegion.textContent).toContain('126 學年');
    expect(liveRegion.textContent).toContain('100');
  });

  it('handles zero values without crashing', () => {
    const zeros = { schools: 0, closing: 0, atRisk: 0, students: 0, unprojected: 0 };
    renderBar({ totals: zeros, closingCount: 0 });

    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('formats large numbers with thousands separators', () => {
    const large = { schools: 1234567, closing: 0, atRisk: 0, students: 9876543, unprojected: 0 };
    renderBar({ totals: large, closingCount: 0 });

    expect(screen.getByText('1,234,567')).toBeTruthy();
    expect(screen.getByText('9,876,543')).toBeTruthy();
  });

  // --- Unprojected display (regression tests for #59) ----------------------

  it('shows the unprojected stat line when unprojected > 0', () => {
    const withUnprojected = { schools: 500, closing: 10, atRisk: 50, students: 30000, unprojected: 15 };
    renderBar({ totals: withUnprojected, closingCount: 10 });

    expect(screen.getByText('其中無推估資料')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('does not show the unprojected stat line when unprojected is 0', () => {
    renderBar();

    expect(screen.queryByText('其中無推估資料')).toBeNull();
  });

  // --- Zero-out toggle (regression tests for #144) -------------------------

  it('renders the closing stat as a toggle button with role="button"', () => {
    renderBar();

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('tabindex')).toBe('0');
  });

  it('sets aria-pressed=true when closed schools are included', () => {
    renderBar({ excludeClosed: false });

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed=false when closed schools are excluded', () => {
    renderBar({ excludeClosed: true });

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('fires onToggleClosed when the toggle is clicked', () => {
    const { props } = renderBar();

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    fireEvent.click(toggle);
    expect(props.onToggleClosed).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleClosed on Enter key', () => {
    const { props } = renderBar();

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(props.onToggleClosed).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleClosed on Space key', () => {
    const { props } = renderBar();

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(props.onToggleClosed).toHaveBeenCalledTimes(1);
  });

  it('shows "不含歸零" label when excludeClosed is true', () => {
    renderBar({ excludeClosed: true });

    expect(screen.getByText(`${AT_RISK_MAX} 人以下（不含歸零）`)).toBeTruthy();
    expect(screen.queryByText(`${AT_RISK_MAX} 人以下（含歸零）`)).toBeNull();
  });

  it('shows "含歸零" label when excludeClosed is false', () => {
    renderBar({ excludeClosed: false });

    expect(screen.getByText(`${AT_RISK_MAX} 人以下（含歸零）`)).toBeTruthy();
    expect(screen.queryByText(`${AT_RISK_MAX} 人以下（不含歸零）`)).toBeNull();
  });

  it('applies excluded styling class when excludeClosed is true', () => {
    renderBar({ excludeClosed: true });

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    expect(toggle.classList.contains('summary__toggle--excluded')).toBe(true);
  });

  it('does not apply excluded styling class when excludeClosed is false', () => {
    renderBar({ excludeClosed: false });

    const toggle = screen.getByRole('button', { name: /推估歸零/ });
    expect(toggle.classList.contains('summary__toggle--excluded')).toBe(false);
  });

  it('always shows closingCount regardless of excludeClosed', () => {
    renderBar({ closingCount: 99, excludeClosed: true });
    expect(screen.getByText('99')).toBeTruthy();
  });
});
