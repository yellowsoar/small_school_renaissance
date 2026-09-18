import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Legend from './Legend.jsx';
import { HEATMAP_THRESHOLD, METHODOLOGY, RISK_TIERS } from '../config/index.js';

vi.mock('./TierGlyph.jsx', () => ({
  default: ({ shape, color }) => (
    <span data-testid={`glyph-${shape}`} data-color={color} />
  ),
}));

describe('Legend', () => {
  it('renders a heading with the selected year', () => {
    render(<Legend year={120} />);

    expect(screen.getByText('120 學年推估分級')).toBeTruthy();
  });

  it('lists every risk tier with label and range description', () => {
    render(<Legend year={114} />);

    for (const tier of RISK_TIERS) {
      expect(screen.getByText(tier.label)).toBeTruthy();
      expect(screen.getByText(tier.describe())).toBeTruthy();
    }
  });

  it('renders a TierGlyph for each tier', () => {
    render(<Legend year={114} />);

    for (const tier of RISK_TIERS) {
      const glyph = screen.getByTestId(`glyph-${tier.shape}`);
      expect(glyph).toBeTruthy();
      expect(glyph.getAttribute('data-color')).toBe(tier.color);
    }
  });

  it('shows the heatmap explanation note with dynamic threshold', () => {
    render(<Legend year={114} />);

    expect(
      screen.getByText(
        new RegExp(`熱區顏色代表 ${HEATMAP_THRESHOLD} 人以下學校的密集程度`),
      ),
    ).toBeTruthy();
  });

  it('shows the methodology caveat', () => {
    render(<Legend year={114} />);

    expect(screen.getByText(METHODOLOGY)).toBeTruthy();
  });

  it('has an accessible label on the aside', () => {
    render(<Legend year={114} />);

    expect(screen.getByLabelText('圖例')).toBeTruthy();
  });
});
