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
      const glyphs = screen.getAllByTestId(`glyph-${tier.shape}`);
      const match = glyphs.find((g) => g.getAttribute('data-color') === tier.color);
      expect(match).toBeTruthy();
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

  it('renders the unprojected marker entry in the legend', () => {
    render(<Legend year={114} />);

    expect(screen.getByText('無推估資料')).toBeTruthy();
    expect(screen.getByText('缺少推估資料')).toBeTruthy();
    const glyphs = screen.getAllByTestId('glyph-circle');
    const unprojectedGlyph = glyphs.find((g) => g.getAttribute('data-color') === '#999');
    expect(unprojectedGlyph).toBeTruthy();
  });
});
