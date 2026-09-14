import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ControlPanel from './ControlPanel.jsx';

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
const layers = { heatmap: true, markers: true };

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

  it('renders all five tier chips', () => {
    renderPanel();

    expect(screen.getByText('推估歸零')).toBeTruthy();
    expect(screen.getByText('極高風險')).toBeTruthy();
    expect(screen.getByText('高風險')).toBeTruthy();
    expect(screen.getByText('需關注')).toBeTruthy();
    expect(screen.getByText('相對穩定')).toBeTruthy();
  });

  it('calls onChange when a tier chip is clicked', () => {
    const onChange = vi.fn();
    renderPanel({ onChange });

    fireEvent.click(screen.getByText('極高風險'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.tiers.has('critical')).toBe(true);
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

    // Click the actual checkbox, not the label span, because fireEvent
    // does not trigger the browser’s implicit label activation.
    const heatmapCheckbox = screen.getByRole('checkbox', { name: /熱區圖/ });
    fireEvent.click(heatmapCheckbox);

    expect(onLayers).toHaveBeenCalledTimes(1);
  });
});
