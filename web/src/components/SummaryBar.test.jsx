import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SummaryBar from './SummaryBar.jsx';

const totals = { schools: 2634, closing: 42, atRisk: 187, students: 98765, unprojected: 0 };

describe('SummaryBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('displays formatted summary statistics', () => {
    render(<SummaryBar totals={totals} year={130} />);

    expect(screen.getByText('2,634')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('187')).toBeTruthy();
    expect(screen.getByText('98,765')).toBeTruthy();
  });

  it('shows correct labels including the selected year', () => {
    render(<SummaryBar totals={totals} year={125} />);

    expect(screen.getByText('符合條件學校')).toBeTruthy();
    expect(screen.getByText('125 學年推估歸零')).toBeTruthy();
    expect(screen.getByText('50 人以下（含歸零）')).toBeTruthy();
    expect(screen.getByText('推估學生總數')).toBeTruthy();
  });

  it('uses a hidden live region instead of aria-live on the dl', () => {
    const { container } = render(
      <SummaryBar totals={totals} year={130} />,
    );

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
      <SummaryBar totals={totals} year={125} />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    const initialText = liveRegion.textContent;

    // Re-render with a different year (simulating slider move)
    const newTotals = { ...totals, closing: 50 };
    rerender(<SummaryBar totals={newTotals} year={126} />);

    // Before the debounce delay, the live region should still hold old text
    act(() => vi.advanceTimersByTime(200));
    expect(liveRegion.textContent).toBe(initialText);
  });

  it('updates the live region text after the debounce delay', () => {
    const { container, rerender } = render(
      <SummaryBar totals={totals} year={125} />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');

    const newTotals = { schools: 100, closing: 10, atRisk: 30, students: 5000, unprojected: 0 };
    rerender(<SummaryBar totals={newTotals} year={126} />);

    act(() => vi.advanceTimersByTime(400));
    expect(liveRegion.textContent).toContain('126 學年');
    expect(liveRegion.textContent).toContain('100');
  });

  it('handles zero values without crashing', () => {
    const zeros = { schools: 0, closing: 0, atRisk: 0, students: 0, unprojected: 0 };
    render(<SummaryBar totals={zeros} year={130} />);

    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('formats large numbers with thousands separators', () => {
    const large = { schools: 1234567, closing: 0, atRisk: 0, students: 9876543, unprojected: 0 };
    render(<SummaryBar totals={large} year={130} />);

    expect(screen.getByText('1,234,567')).toBeTruthy();
    expect(screen.getByText('9,876,543')).toBeTruthy();
  });

  // --- Unprojected display (regression tests for #59) ----------------------

  it('shows the unprojected stat line when unprojected > 0', () => {
    const withUnprojected = { schools: 500, closing: 10, atRisk: 50, students: 30000, unprojected: 15 };
    render(<SummaryBar totals={withUnprojected} year={130} />);

    expect(screen.getByText('其中無推估資料')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('does not show the unprojected stat line when unprojected is 0', () => {
    render(<SummaryBar totals={totals} year={130} />);

    expect(screen.queryByText('其中無推估資料')).toBeNull();
  });
});
