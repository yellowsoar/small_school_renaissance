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
  name: '\u6E2C\u8A66\u570B\u5C0F',
  county: '\u81FA\u5317\u5E02',
  town: '\u4FE1\u7FA9\u5340',
  address: '\u53F0\u5317\u5E02\u4FE1\u7FA9\u8DEF\u4E00\u865F',
  phone: '02-12345678',
  website: 'https://example.edu.tw',
  remoteness: '\u4E00\u822C\u5730\u5340',
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

const tier = { id: 'critical', label: '\u6975\u9AD8\u98A8\u96AA', color: '#d7263d', max: 30 };

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolPopup', () => {
  it('displays school name, location, and remoteness', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText('\u6E2C\u8A66\u570B\u5C0F')).toBeTruthy();
    expect(screen.getByText(/\u81FA\u5317\u5E02/)).toBeTruthy();
    expect(screen.getByText(/\u4FE1\u7FA9\u5340/)).toBeTruthy();
    expect(screen.getByText(/\u4E00\u822C\u5730\u5340/)).toBeTruthy();
  });

  it('shows the projected headcount for the selected year', () => {
    render(<SchoolPopup school={makeSchool()} year={125} tier={tier} />);

    // year 125 -> index 11 -> 150 - 110 = 40
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('125 \u5B78\u5E74\u63A8\u4F30')).toBeTruthy();
  });

  it('shows the unprojected message when reference data is missing', () => {
    const school = makeSchool({
      unprojected: true,
      projections: new Map(
        Array.from({ length: 17 }, (_, i) => [114 + i, null]),
      ),
    });

    render(<SchoolPopup school={school} year={130} tier={null} />);

    expect(screen.getByText(new RegExp(`\u7F3A\u5C11 ${REFERENCE_YEAR} \u5B78\u5E74\u5C0D\u7167\u8CC7\u6599`))).toBeTruthy();
  });

  it('shows "\u7121\u63A8\u4F30" when tier is null but school is projected', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={null} />);

    expect(screen.getByText(/\u7121\u63A8\u4F30/)).toBeTruthy();
  });

  it('renders enrollment and reference stats in the detail grid', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText(`${BASE_YEAR} \u5B78\u5E74`)).toBeTruthy();
    expect(screen.getByText('150')).toBeTruthy();
    expect(screen.getByText(`${REFERENCE_YEAR} \u5B78\u5E74`)).toBeTruthy();
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

    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a safe website link', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    const link = screen.getByText('\u5B78\u6821\u7DB2\u7AD9 \u2197');
    expect(link.getAttribute('href')).toBe('https://example.edu.tw');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('hides website link for unsafe URLs', () => {
    const school = makeSchool({ website: 'javascript:alert(1)' });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    expect(screen.queryByText('\u5B78\u6821\u7DB2\u7AD9 \u2197')).toBeNull();
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

  it('strips extension marker \u5206\u6A5F from phone tel: link', () => {
    const school = makeSchool({ phone: '(02) 2345-6789 \u5206\u6A5F 302' });
    render(<SchoolPopup school={school} year={130} tier={tier} />);

    const phoneLink = screen.getByText('(02) 2345-6789 \u5206\u6A5F 302');
    expect(phoneLink.getAttribute('href')).toBe('tel:0223456789');
  });

  it('hides phone link when phone yields no dialable digits', () => {
    const school = makeSchool({ phone: '\u7121\u96FB\u8A71' });
    const { container } = render(
      <SchoolPopup school={school} year={130} tier={tier} />,
    );

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('displays the address', () => {
    render(<SchoolPopup school={makeSchool()} year={130} tier={tier} />);

    expect(screen.getByText('\u53F0\u5317\u5E02\u4FE1\u7FA9\u8DEF\u4E00\u865F')).toBeTruthy();
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
