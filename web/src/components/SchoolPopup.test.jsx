import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolPopup from './SchoolPopup.jsx';
import { BASE_YEAR, REFERENCE_YEAR } from '../config/index.js';

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
  projections: new Map(
    Array.from({ length: 17 }, (_, i) => [114 + i, Math.max(0, 150 - i * 10)]),
  ),
  unprojected: false,
  ...overrides,
});

const tier = { id: 'critical', label: '極高風險', color: '#d7263d', max: 30 };

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolPopup', () => {
  it('displays school name, location, and remoteness', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText('測試國小')).toBeTruthy();
    expect(screen.getByText(/臺北市/)).toBeTruthy();
    expect(screen.getByText(/信義區/)).toBeTruthy();
    expect(screen.getByText(/一般地區/)).toBeTruthy();
  });

  it('shows the projected headcount for the selected year', () => {
    render(<SchoolPopup school={makeSchool()} year={125} tier={tier} />);

    // year 125 -> index 11 -> 150 - 110 = 40
    expect(screen.getByText('40')).toBeTruthy();
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

    expect(screen.getByText(new RegExp(`缺少 ${REFERENCE_YEAR} 學年對照資料`))).toBeTruthy();
  });

  it('shows "無推估" when tier is null but school is projected', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={null} />);

    expect(screen.getByText(/無推估/)).toBeTruthy();
  });

  it('renders enrollment and reference stats in the detail grid', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText(`${BASE_YEAR} 學年`)).toBeTruthy();
    expect(screen.getByText('150')).toBeTruthy();
    expect(screen.getByText(`${REFERENCE_YEAR} 學年`)).toBeTruthy();
    expect(screen.getByText('180')).toBeTruthy();
  });

  it('renders negative delta with sign and ratio as percentage', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    // delta = -30 -> "-30", deltaRatio = -0.167 -> "-16.7%"
    expect(screen.getByText('-30')).toBeTruthy();
    expect(screen.getByText('-16.7%')).toBeTruthy();
  });

  it('renders positive delta with "+" prefix', () => {
    const school = makeSchool({ delta: 25, deltaRatio: 0.167 });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    expect(screen.getByText('+25')).toBeTruthy();
    expect(screen.getByText('+16.7%')).toBeTruthy();
  });

  it('shows dash when delta values are null', () => {
    const school = makeSchool({ delta: null, deltaRatio: null, reference: null });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
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

  it('strips extension marker # from phone tel: link', () => {
    const school = makeSchool({ phone: '(02) 2345-6789#302' });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    const phoneLink = screen.getByText('(02) 2345-6789#302');
    expect(phoneLink.getAttribute('href')).toBe('tel:0223456789');
  });

  it('strips extension marker 分機 from phone tel: link', () => {
    const school = makeSchool({ phone: '(02) 2345-6789 分機 302' });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    const phoneLink = screen.getByText('(02) 2345-6789 分機 302');
    expect(phoneLink.getAttribute('href')).toBe('tel:0223456789');
  });

  it('hides phone link when phone yields no dialable digits', () => {
    const school = makeSchool({ phone: '無電話' });
    const { container } = render(
      <SchoolPopup school={school} year={130} tier={tier} />,
    );

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
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
