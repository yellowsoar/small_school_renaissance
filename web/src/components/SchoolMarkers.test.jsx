import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SchoolMarkers from './SchoolMarkers.jsx';
import { MAP } from '../config/index.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  useVisibleSchools: vi.fn(),
  tierFor: vi.fn(),
  iconFor: vi.fn(() => ({})),
  openPopup: vi.fn(),
}));

vi.mock('react-leaflet', () => ({
  Marker: ({ children, title, alt, eventHandlers }) => {
    const refCb = (node) => {
      if (node && eventHandlers?.add) {
        eventHandlers.add({ target: { getElement: () => node, openPopup: mocks.openPopup } });
      }
    };
    return (
      <div ref={refCb} data-testid="marker" data-title={title} data-alt={alt}>
        {children}
      </div>
    );
  },
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));

vi.mock('../hooks/useVisibleSchools.js', () => ({
  useVisibleSchools: mocks.useVisibleSchools,
}));

vi.mock('../lib/schools.js', () => ({
  tierFor: mocks.tierFor,
}));

vi.mock('../lib/markerIcons.js', () => ({
  iconFor: mocks.iconFor,
}));

vi.mock('./SchoolPopup.jsx', () => ({
  default: ({ school }) => <div data-testid="school-popup">{school.name}</div>,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const tier = { id: 'critical', label: '\u6975\u9ad8\u98a8\u96aa', color: '#d7263d', max: 30 };

const makeSchool = (overrides = {}) => ({
  id: 'school-1',
  name: '\u6e2c\u8a66\u570b\u5c0f',
  position: [25.0, 121.5],
  projections: new Map([[130, 20]]),
  ...overrides,
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolMarkers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Marker for each visible school with a tier', () => {
    const schools = [makeSchool(), makeSchool({ id: 'school-2', name: '\u53e6\u4e00\u570b\u5c0f' })];
    mocks.useVisibleSchools.mockReturnValue(schools);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={schools} year={130} visible={true} />);

    expect(screen.getAllByTestId('marker')).toHaveLength(2);
  });

  it('skips schools where tierFor returns null', () => {
    const schools = [makeSchool(), makeSchool({ id: 'school-2', name: '\u53e6\u4e00\u570b\u5c0f' })];
    mocks.useVisibleSchools.mockReturnValue(schools);
    mocks.tierFor
      .mockReturnValueOnce(tier)
      .mockReturnValueOnce(null);

    render(<SchoolMarkers schools={schools} year={130} visible={true} />);

    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });

  it('passes correct title and alt to Marker', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    expect(marker.getAttribute('data-title')).toBe('\u6e2c\u8a66\u570b\u5c0f');
    expect(marker.getAttribute('data-alt')).toBe('\u6e2c\u8a66\u570b\u5c0f\uff08\u6975\u9ad8\u98a8\u96aa\uff09');
  });

  it('passes an empty array to useVisibleSchools when not visible', () => {
    mocks.useVisibleSchools.mockReturnValue([]);

    render(<SchoolMarkers schools={[makeSchool()]} year={130} visible={false} />);

    expect(mocks.useVisibleSchools).toHaveBeenCalledWith([], MAP.markerZoom);
  });

  it('renders SchoolPopup inside each Marker Popup', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    expect(screen.getByTestId('school-popup')).toBeTruthy();
    expect(screen.getByText('\u6e2c\u8a66\u570b\u5c0f')).toBeTruthy();
  });

  it('calls iconFor with the tier for each school', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    expect(mocks.iconFor).toHaveBeenCalledWith(tier);
  });

  it('sets role="button" on the marker element via eventHandlers.add', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    expect(marker.getAttribute('role')).toBe('button');
  });

  it('sets aria-label with school name and tier label via eventHandlers.add', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    expect(marker.getAttribute('aria-label')).toBe('\u6e2c\u8a66\u570b\u5c0f\uff08\u6975\u9ad8\u98a8\u96aa\uff09');
  });

  it('sets correct aria-label for each school in a multi-marker render', () => {
    const schools = [
      makeSchool(),
      makeSchool({ id: 'school-2', name: '\u53e6\u4e00\u570b\u5c0f' }),
    ];
    mocks.useVisibleSchools.mockReturnValue(schools);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={schools} year={130} visible={true} />);

    const markers = screen.getAllByTestId('marker');
    expect(markers[0].getAttribute('aria-label')).toBe('\u6e2c\u8a66\u570b\u5c0f\uff08\u6975\u9ad8\u98a8\u96aa\uff09');
    expect(markers[1].getAttribute('aria-label')).toBe('\u53e6\u4e00\u570b\u5c0f\uff08\u6975\u9ad8\u98a8\u96aa\uff09');
  });

  it('sets tabindex="0" on the marker element for keyboard focusability', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    expect(marker.getAttribute('tabindex')).toBe('0');
  });

  it('opens popup when Enter key is pressed on a focused marker', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    fireEvent.keyDown(marker, { key: 'Enter' });

    expect(mocks.openPopup).toHaveBeenCalledTimes(1);
  });

  it('opens popup when Space key is pressed on a focused marker', () => {
    const school = makeSchool();
    mocks.useVisibleSchools.mockReturnValue([school]);
    mocks.tierFor.mockReturnValue(tier);

    render(<SchoolMarkers schools={[school]} year={130} visible={true} />);

    const marker = screen.getByTestId('marker');
    fireEvent.keyDown(marker, { key: ' ' });

    expect(mocks.openPopup).toHaveBeenCalledTimes(1);
  });
});
