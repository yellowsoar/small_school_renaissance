import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryBar from './SummaryBar.jsx';

const totals = { schools: 2634, closing: 42, atRisk: 187, students: 98765 };

describe('SummaryBar', () => {
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

  it('has aria-live="polite" for screen reader accessibility', () => {
    const { container } = render(
      <SummaryBar totals={totals} year={130} />,
    );

    const dl = container.querySelector('dl');
    expect(dl.getAttribute('aria-live')).toBe('polite');
    expect(dl.getAttribute('aria-atomic')).toBe('true');
  });

  it('handles zero values without crashing', () => {
    const zeros = { schools: 0, closing: 0, atRisk: 0, students: 0 };
    render(<SummaryBar totals={zeros} year={130} />);

    expect(screen.getAllByText('0')).toHaveLength(4);
  });
});
