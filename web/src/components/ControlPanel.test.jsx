import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ControlPanel from './ControlPanel.jsx';
import { RISK_TIERS, PROJECTION_YEARS, TILE_LAYERS } from '../config/index.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const defaultFilters = {
  year: 130,
  counties: new Set(),
  tiers: new Set(),
  search: '',
};

const counties = ['臺北市', '新北市', '桃園市'];
const layers = { heatmap: true, markers: true, baseMap: 'osm' };

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

  it('calls onChange when a tier chip is clicked', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    fireEvent.click(screen.getByText('極高風險'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.tiers.has('critical')).toBe(true);
  });

  it('marks an active tier chip with aria-pressed', () => {
    renderPanel({
      filters: { ...defaultFilters, tiers: new Set(['critical']) },
    });

    const chip = screen.getByText('極高風險');
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    const stable = screen.getByText('相對穩定');
    expect(stable.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders county chips', () => {
    renderPanel();

    expect(screen.getByText('臺北市')).toBeTruthy();
    expect(screen.getByText('新北市')).toBeTruthy();
    expect(screen.getByText('桃園市')).toBeTruthy();
  });

  it('calls onChange when a county chip is clicked', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    fireEvent.click(screen.getByText('新北市'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.counties.has('新北市')).toBe(true);
  });

  it('marks an active county chip with aria-pressed', () => {
    renderPanel({
      filters: { ...defaultFilters, counties: new Set(['桃園市']) },
    });

    const active = screen.getByText('桃園市');
    expect(active.getAttribute('aria-pressed')).toBe('true');

    const inactive = screen.getByText('臺北市');
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
    renderPanel({ filters: { ...defaultFilters, search: '國小' } });

    expect(screen.getByText('清除篩選')).toBeTruthy();
  });

  it('shows reset button when tier filter is active', () => {
    renderPanel({
      filters: { ...defaultFilters, tiers: new Set(['critical']) },
    });

    expect(screen.getByText('清除篩選')).toBeTruthy();
  });

  it('shows reset button when county filter is active', () => {
    renderPanel({
      filters: { ...defaultFilters, counties: new Set(['臺北市']) },
    });

    expect(screen.getByText('清除篩選')).toBeTruthy();
  });

  it('hides reset button when no filters are active', () => {
    renderPanel();

    expect(screen.queryByText('清除篩選')).toBeNull();
  });

  it('calls onReset when the reset button is clicked', () => {
    const onReset = vi.fn();
    renderPanel({
      filters: { ...defaultFilters, search: '國小' },
      onReset,
    });

    fireEvent.click(screen.getByText('清除篩選'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('calls onChange when the search input changes', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    const input = screen.getByPlaceholderText('例如：插角國小、烏來區');
    fireEvent.change(input, { target: { value: '插角' } });

    expect(onChange).toHaveBeenCalledWith({ search: '插角' });
  });

  it('renders layer toggles', () => {
    renderPanel();

    expect(screen.getByText('熱區圖')).toBeTruthy();
    expect(screen.getByText('學校點位')).toBeTruthy();
  });

  it('calls onLayers when a layer checkbox is toggled', () => {
    const onLayers = vi.fn();
    renderPanel({ onLayers });

    const heatmapCheckbox = screen.getByRole('checkbox', {
      name: '熱區圖',
    });
    fireEvent.click(heatmapCheckbox);

    expect(onLayers).toHaveBeenCalledTimes(1);
  });

  it('renders all base map radio options from config', () => {
    renderPanel();

    for (const tile of TILE_LAYERS) {
      expect(screen.getByText(tile.label)).toBeTruthy();
    }
  });

  it('checks the active base map radio button', () => {
    renderPanel();

    const radios = screen.getAllByRole('radio');
    const osmRadio = radios.find((r) => r.value === 'osm');
    expect(osmRadio.checked).toBe(true);

    const positronRadio = radios.find((r) => r.value === 'positron');
    expect(positronRadio.checked).toBe(false);
  });

  it('calls onLayers with the selected base map id', () => {
    const onLayers = vi.fn();
    renderPanel({ onLayers });

    const positronLabel = screen.getByText(TILE_LAYERS.find((t) => t.id === 'positron').label);
    const radio = positronLabel.closest('label').querySelector('input[type="radio"]');
    fireEvent.click(radio);

    expect(onLayers).toHaveBeenCalledWith({ baseMap: 'positron' });
  });
});
