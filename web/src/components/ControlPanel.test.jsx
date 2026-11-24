import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ControlPanel from './ControlPanel.jsx';
import { RISK_TIERS, PROJECTION_YEARS, TILE_LAYERS, OVERLAY_LAYERS } from '../config/index.js';
import globalCss from '../styles/global.css?raw';

// WCAG relative luminance for the opaque hex colors used by risk chips.
const luminance = (hex) => {
  const digits = hex.slice(1);
  const expanded = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  const channels = expanded.match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const defaultFilters = {
  year: 130,
  counties: new Set(),
  tiers: new Set(),
  search: '',
};

const counties = ['\u81fa\u5317\u5e02', '\u65b0\u5317\u5e02', '\u6843\u5712\u5e02'];
const layers = { heatmap: true, markers: true, baseMap: 'osm', countyBoundary: true };

const renderPanel = (overrides = {}) =>
  render(
    <ControlPanel
      filters={defaultFilters}
      counties={counties}
      layers={layers}
      onChange={vi.fn()}
      onLayers={vi.fn()}
      onReset={vi.fn()}
      {...overrides}
    />,
  );

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ControlPanel', () => {
  it('checks contrast against known black/white reference values (#500)', () => {
    expect(contrastRatio('#000', '#ffffff')).toBe(21);
    expect(contrastRatio('#fff', '#000000')).toBe(21);
    expect(contrastRatio('#f07300', '#f07300')).toBe(1);
  });

  it('renders the current year value', () => {
    const { container } = renderPanel();

    const output = container.querySelector('.panel__year');
    expect(output.textContent).toBe('130');
  });

  it('renders all tier chips from config', () => {
    renderPanel();

    for (const tier of RISK_TIERS) {
      expect(screen.getByText(tier.label)).toBeTruthy();
    }
  });

  it.each(RISK_TIERS)('gives the active $id chip at least 4.5:1 text contrast (#500)', (tier) => {
    renderPanel({
      filters: { ...defaultFilters, tiers: new Set([tier.id]) },
    });

    const chip = screen.getByRole('button', { name: tier.label });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.getAttribute('data-active')).toBe('true');
    expect(chip.style.getPropertyValue('--chip')).toBe(tier.color);
    // Assert the rendered foreground, not just the configuration.
    const foreground = chip.style.getPropertyValue('--chip-ink');
    expect(foreground).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
    expect(contrastRatio(foreground, tier.color)).toBeGreaterThanOrEqual(4.5);
  });

  it('only applies the risk foreground in the active CSS rule (#500)', () => {
    expect(globalCss).toMatch(
      /\.chip\[data-active='true'\]\s*\{\s*color:\s*var\(--chip-ink,\s*#fff\);/,
    );
    const inactiveRule = globalCss.match(/\.chip\s*\{([^}]+)\}/)[1];
    expect(inactiveRule).toContain('color: var(--ink-soft);');
    expect(inactiveRule).not.toContain('--chip-ink');
  });

  it('keeps county chips independent of risk foreground colors (#500)', () => {
    renderPanel({
      filters: { ...defaultFilters, counties: new Set([counties[0]]) },
    });

    for (const county of counties) {
      const chip = screen.getByRole('button', { name: county });
      expect(chip.style.getPropertyValue('--chip-ink')).toBe('');
      expect(chip.style.getPropertyValue('--chip')).toBe('');
      expect(chip.getAttribute('aria-pressed')).toBe(String(county === counties[0]));
    }
  });

  it('calls onChange when a tier chip is clicked', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    fireEvent.click(screen.getByText('\u6975\u9ad8\u98a8\u96aa'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.tiers.has('critical')).toBe(true);
  });

  it('marks an active tier chip with aria-pressed', () => {
    renderPanel({
      filters: { ...defaultFilters, tiers: new Set(['critical']) },
    });

    const chip = screen.getByText('\u6975\u9ad8\u98a8\u96aa');
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    const stable = screen.getByText('\u76f8\u5c0d\u7a69\u5b9a');
    expect(stable.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders county chips', () => {
    renderPanel();

    expect(screen.getByText('\u81fa\u5317\u5e02')).toBeTruthy();
    expect(screen.getByText('\u65b0\u5317\u5e02')).toBeTruthy();
    expect(screen.getByText('\u6843\u5712\u5e02')).toBeTruthy();
  });

  it('calls onChange when a county chip is clicked', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    fireEvent.click(screen.getByText('\u65b0\u5317\u5e02'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.counties.has('\u65b0\u5317\u5e02')).toBe(true);
  });

  it('marks an active county chip with aria-pressed', () => {
    renderPanel({
      filters: { ...defaultFilters, counties: new Set(['\u6843\u5712\u5e02']) },
    });

    const active = screen.getByText('\u6843\u5712\u5e02');
    expect(active.getAttribute('aria-pressed')).toBe('true');

    const inactive = screen.getByText('\u81fa\u5317\u5e02');
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange with numeric year when the slider changes', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '120' } });

    expect(onChange).toHaveBeenCalledWith({ year: 120 });
  });

  it('constrains the slider range to projection years', () => {
    renderPanel();

    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('min')).toBe(String(PROJECTION_YEARS.at(0)));
    expect(slider.getAttribute('max')).toBe(String(PROJECTION_YEARS.at(-1)));
  });

  it('shows reset button when search filter is active', () => {
    renderPanel({ filters: { ...defaultFilters, search: '\u570b\u5c0f' } });

    expect(screen.getByText('\u6e05\u9664\u7be9\u9078')).toBeTruthy();
  });

  it('shows reset button when tier filter is active', () => {
    renderPanel({
      filters: { ...defaultFilters, tiers: new Set(['critical']) },
    });

    expect(screen.getByText('\u6e05\u9664\u7be9\u9078')).toBeTruthy();
  });

  it('shows reset button when county filter is active', () => {
    renderPanel({
      filters: { ...defaultFilters, counties: new Set(['\u81fa\u5317\u5e02']) },
    });

    expect(screen.getByText('\u6e05\u9664\u7be9\u9078')).toBeTruthy();
  });

  it('hides reset button when no filters are active', () => {
    renderPanel();

    expect(screen.queryByText('\u6e05\u9664\u7be9\u9078')).toBeNull();
  });

  it('calls onReset when the reset button is clicked', () => {
    const onReset = vi.fn();
    renderPanel({
      filters: { ...defaultFilters, search: '\u570b\u5c0f' },
      onReset,
    });

    fireEvent.click(screen.getByText('\u6e05\u9664\u7be9\u9078'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('calls onChange when the search input changes', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    const input = screen.getByPlaceholderText('\u4f8b\u5982\uff1a\u63d2\u89d2\u570b\u5c0f\u3001\u70cf\u4f86\u5340');
    fireEvent.change(input, { target: { value: '\u63d2\u89d2' } });

    expect(onChange).toHaveBeenCalledWith({ search: '\u63d2\u89d2' });
  });

  it('renders layer toggles', () => {
    renderPanel();

    expect(screen.getByText('\u71b1\u5340\u5716')).toBeTruthy();
    expect(screen.getByText('\u5b78\u6821\u9ede\u4f4d')).toBeTruthy();
  });

  it('calls onLayers when a layer checkbox is toggled', () => {
    const onLayers = vi.fn();
    renderPanel({ onLayers });

    const heatmapCheckbox = screen.getByRole('checkbox', {
      name: '\u71b1\u5340\u5716',
    });
    fireEvent.click(heatmapCheckbox);

    expect(onLayers).toHaveBeenCalledTimes(1);
  });

  it('renders all base map options in the select menu (#371)', () => {
    renderPanel();

    const select = screen.getByRole('combobox', { name: /\u5e95\u5716/ });
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(TILE_LAYERS.length);
    for (let i = 0; i < TILE_LAYERS.length; i++) {
      expect(options[i].textContent).toBe(TILE_LAYERS[i].label);
      expect(options[i].value).toBe(TILE_LAYERS[i].id);
    }
  });

  it('selects the active base map in the select menu (#371)', () => {
    renderPanel();

    const select = screen.getByRole('combobox', { name: /\u5e95\u5716/ });
    expect(select.value).toBe('osm');
  });

  it('calls onLayers with the selected base map id (#371)', () => {
    const onLayers = vi.fn();
    renderPanel({ onLayers });

    const select = screen.getByRole('combobox', { name: /\u5e95\u5716/ });
    fireEvent.change(select, { target: { value: 'hot' } });

    expect(onLayers).toHaveBeenCalledWith({ baseMap: 'hot' });
  });

  it('renders overlay layer checkboxes from config', () => {
    renderPanel();

    for (const overlay of OVERLAY_LAYERS) {
      expect(screen.getByText(overlay.label)).toBeTruthy();
    }
  });

  it('calls onLayers when an overlay checkbox is toggled', () => {
    const onLayers = vi.fn();
    renderPanel({ onLayers });

    const overlayCheckbox = screen.getByRole('checkbox', {
      name: OVERLAY_LAYERS[0].label,
    });
    fireEvent.click(overlayCheckbox);

    expect(onLayers).toHaveBeenCalledWith({
      [OVERLAY_LAYERS[0].id]: false,
    });
  });

  it('reflects overlay layer checked state from layers prop', () => {
    renderPanel({
      layers: { ...layers, countyBoundary: false },
    });

    const overlayCheckbox = screen.getByRole('checkbox', {
      name: OVERLAY_LAYERS[0].label,
    });
    expect(overlayCheckbox.checked).toBe(false);
  });
});
