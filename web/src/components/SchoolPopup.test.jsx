import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolPopup from './SchoolPopup.jsx';

// Stub the sparkline so this suite stays focused on SchoolPopup logic.
vi.mock('./TrendSparkline.jsx', () => ({
  default: () => <div data-testid="sparkline" />,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const makeSchool = (overrides = {}) => ({
  id: '123456',
  name: '測試國小',
  county: '臺北市',
  town: '信義區',
  address: '台北市信義路一號',
  phone: '02-12345678',
  website: 'https://example.edu.tw',
  remoteness: '一般地區',
  position: [25.033, 121.565],
  enrollment: 150,
  reference: 180,
  delta: -30,
  deltaRatio: -0.167,
  projections: new Map([
    [114, 140],
    [115, 130],
    [116, 120],
    [117, 110],
    [118, 100],
    [119, 90],
    [120, 80],
    [121, 70],
    [122, 60],
    [123, 50],
    [124, 40],
    [125, 30],
    [126, 20],
    [127, 10],
    [128, 5],
    [129, 2],
    [130, 0],
  ]),
  unprojected: false,
  ...overrides,
});

const tier = { id: 'critical', label: '極高風險', color: '#d7263d', max: 30 };

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolPopup', () => {
  it('displays school name and location', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText('測試國小')).toBeTruthy();
    expect(screen.getByText(/臺北市/)).toBeTruthy();
    expect(screen.getByText(/信義區/)).toBeTruthy();
  });

  it('shows the projected headcount for the selected year', () => {
    render(<SchoolPopup school={makeSchool()} year={125} tier={tier} />);

    // year 125 → projected = 30
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('125 學年推估')).toBeTruthy();
  });

  it('shows the unprojected message when reference data is missing', () => {
    const school = makeSchool({
      unprojected: true,
      projections: new Map(
        Array.from({ length: 17 }, (_, i) => [114 + i, null]),
      ),
    });

    render(<SchoolPopup school={school} year={130} tier={null} />);

    expect(screen.getByText(/缺少.*學年對照資料/)).toBeTruthy();
  });

  it('renders a safe website link', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    const link = screen.getByText('學校網站 ↗');
    expect(link.getAttribute('href')).toBe('https://example.edu.tw');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('hides website link for unsafe URLs', () => {
    const school = makeSchool({ website: 'javascript:alert(1)' });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    expect(screen.queryByText('學校網站 ↗')).toBeNull();
  });

  it('renders a phone link with digits only in the href', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    const phoneLink = screen.getByText('02-12345678');
    expect(phoneLink.getAttribute('href')).toBe('tel:0212345678');
  });

  it('displays the address', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText('台北市信義路一號')).toBeTruthy();
  });

  it('omits address when not available', () => {
    const school = makeSchool({ address: null });
    const { container } = render(
      <SchoolPopup school={school} year={130} tier={tier} />,
    );

    expect(container.querySelector('.popup__meta')).toBeNull();
  });

  it('renders the sparkline for projected schools', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByTestId('sparkline')).toBeTruthy();
  });
});
