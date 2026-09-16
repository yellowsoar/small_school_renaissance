import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App.jsx';
import { BASE_YEAR, REFERENCE_YEAR, PROJECTION_YEARS } from './config/index.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('./components/SchoolMap.jsx', () => ({
  default: () => <div data-testid="school-map" />,
}));

vi.mock('./components/ControlPanel.jsx', () => ({
  default: () => <div data-testid="control-panel" />,
}));

vi.mock('./components/SummaryBar.jsx', () => ({
  default: () => <div data-testid="summary-bar" />,
}));

vi.mock('./components/Legend.jsx', () => ({
  default: () => <div data-testid="legend" />,
}));

vi.mock('./components/ErrorBoundary.jsx', () => ({
  default: ({ children }) => <div data-testid="error-boundary">{children}</div>,
}));

const mocks = vi.hoisted(() => ({
  useSchoolData: vi.fn(),
  useUrlFilters: vi.fn(),
  filterSchools: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('./hooks/useSchoolData.js', () => ({
  useSchoolData: mocks.useSchoolData,
}));

vi.mock('./hooks/useUrlFilters.js', () => ({
  useUrlFilters: mocks.useUrlFilters,
}));

vi.mock('./lib/schools.js', () => ({
  filterSchools: mocks.filterSchools,
  summarize: mocks.summarize,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const defaultFilters = {
  year: 130,
  counties: new Set(),
  tiers: new Set(),
  search: '',
};

const mockSetFilters = vi.fn();
const mockResetFilters = vi.fn();
const mockReload = vi.fn();

const setupLoading = () => {
  mocks.useSchoolData.mockReturnValue({
    status: 'loading',
    schools: [],
    counties: [],
    error: null,
    reload: mockReload,
  });
  mocks.useUrlFilters.mockReturnValue([defaultFilters, mockSetFilters, mockResetFilters]);
  mocks.filterSchools.mockReturnValue([]);
  mocks.summarize.mockReturnValue({});
};

const setupError = (message = '\u8cc7\u6599\u8f09\u5165\u5931\u6557') => {
  mocks.useSchoolData.mockReturnValue({
    status: 'error',
    schools: [],
    counties: [],
    error: new Error(message),
    reload: mockReload,
  });
  mocks.useUrlFilters.mockReturnValue([defaultFilters, mockSetFilters, mockResetFilters]);
  mocks.filterSchools.mockReturnValue([]);
  mocks.summarize.mockReturnValue({});
};

const setupReady = ({ visible = [{ id: '1' }] } = {}) => {
  mocks.useSchoolData.mockReturnValue({
    status: 'ready',
    schools: [{ id: '1' }],
    counties: ['\u81fa\u5317\u5e02'],
    error: null,
    reload: mockReload,
  });
  mocks.useUrlFilters.mockReturnValue([defaultFilters, mockSetFilters, mockResetFilters]);
  mocks.filterSchools.mockReturnValue(visible);
  mocks.summarize.mockReturnValue({ total: 1 });
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state with status message', () => {
    setupLoading();
    render(<App />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/\u8f09\u5165\u5168\u53f0\u570b\u5c0f\u8cc7\u6599\u4e2d/)).toBeTruthy();
  });

  it('does not render SummaryBar while loading', () => {
    setupLoading();
    render(<App />);

    expect(screen.queryByTestId('summary-bar')).toBeNull();
  });

  it('renders error state with alert and error message', () => {
    setupError('\u7db2\u8def\u932f\u8aa4');
    render(<App />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('\u7db2\u8def\u932f\u8aa4')).toBeTruthy();
  });

  it('renders reload button in error state', () => {
    setupError();
    render(<App />);

    expect(screen.getByText('\u91cd\u65b0\u8f09\u5165')).toBeTruthy();
  });

  it('calls reload when the reload button is clicked', () => {
    setupError();
    render(<App />);

    fireEvent.click(screen.getByText('\u91cd\u65b0\u8f09\u5165'));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('renders SchoolMap, sidebar, SummaryBar and Legend when ready', () => {
    setupReady();
    render(<App />);

    expect(screen.getByTestId('school-map')).toBeTruthy();
    expect(screen.getByTestId('control-panel')).toBeTruthy();
    expect(screen.getByTestId('summary-bar')).toBeTruthy();
    expect(screen.getByTestId('legend')).toBeTruthy();
  });

  it('wraps ready content in ErrorBoundary', () => {
    setupReady();
    render(<App />);

    expect(screen.getByTestId('error-boundary')).toBeTruthy();
  });

  it('toggles sidebar aria-expanded on button click', () => {
    setupReady();
    render(<App />);

    const toggleBtn = screen.getByText('\u6536\u5408\u5074\u6b04');
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggleBtn);
    expect(screen.getByText('\u5c55\u958b\u5074\u6b04').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows empty results message when visible schools is empty', () => {
    setupReady({ visible: [] });
    render(<App />);

    expect(screen.getByText(/\u76ee\u524d\u7684\u7be9\u9078\u689d\u4ef6\u6c92\u6709\u7b26\u5408\u7684\u5b78\u6821/)).toBeTruthy();
  });

  it('renders a reset button in empty results that calls resetFilters', () => {
    setupReady({ visible: [] });
    render(<App />);

    fireEvent.click(screen.getByText('\u6e05\u9664\u7be9\u9078'));
    expect(mockResetFilters).toHaveBeenCalledTimes(1);
  });

  it('does not show empty message when visible schools exist', () => {
    setupReady();
    render(<App />);

    expect(screen.queryByText(/\u76ee\u524d\u7684\u7be9\u9078\u689d\u4ef6\u6c92\u6709\u7b26\u5408\u7684\u5b78\u6821/)).toBeNull();
  });

  it('renders the header title and subtitle', () => {
    setupLoading();
    render(<App />);

    expect(screen.getByText('\u5ee2\u6821\u9810\u8b66')).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(
          `\u4ee5 ${BASE_YEAR} \u8207 ${REFERENCE_YEAR} \u5b78\u5e74\u5ea6\u6559\u80b2\u90e8\u7d71\u8a08\u63a8\u4f30 ${PROJECTION_YEARS.at(0)}`,
        ),
      ),
    ).toBeTruthy();
  });

  it('renders the footer with credits and repo link', () => {
    setupLoading();
    render(<App />);

    const link = screen.getByText('yellowsoar/small_school_renaissance');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/yellowsoar/small_school_renaissance',
    );
  });

  it('always renders the sidebar toggle button', () => {
    setupLoading();
    render(<App />);

    expect(screen.getByText('\u6536\u5408\u5074\u6b04')).toBeTruthy();
  });

  it('sets inert on sidebar when panel is collapsed', () => {
    setupReady();
    render(<App />);

    fireEvent.click(screen.getByText('\u6536\u5408\u5074\u6b04'));

    const sidebar = document.getElementById('sidebar');
    expect(sidebar.hasAttribute('inert')).toBe(true);
  });

  it('does not set inert on sidebar when panel is open', () => {
    setupReady();
    render(<App />);

    const sidebar = document.getElementById('sidebar');
    expect(sidebar.hasAttribute('inert')).toBe(false);
  });
});
