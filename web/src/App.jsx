import { useMemo, useReducer, useState } from 'react';
import { BASE_YEAR, COUNTY_BOUNDARY_URL, OVERLAY_LAYERS, REFERENCE_YEAR, PROJECTION_YEARS } from './config/index.js';
import { filterSchools, summarize, tierFor } from './lib/schools.js';
import { useSchoolData } from './hooks/useSchoolData.js';
import { useGeoJson } from './hooks/useGeoJson.js';
import { useUrlFilters } from './hooks/useUrlFilters.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SchoolMap from './components/SchoolMap.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import Legend from './components/Legend.jsx';

const merge = (state, patch) => ({ ...state, ...patch });

/** Build initial overlay state from config: { countyBoundary: true, ... } */
const initialOverlays = Object.fromEntries(
  OVERLAY_LAYERS.map((l) => [l.id, l.defaultEnabled]),
);

export default function App() {
  const { status, schools, counties, error, reload } = useSchoolData();
  const countyBoundary = useGeoJson(COUNTY_BOUNDARY_URL);

  // Stable for the lifetime of a loaded dataset, which is what lets
  // useUrlFilters re-validate the URL's counties exactly once.
  const countySet = useMemo(() => (counties.length ? new Set(counties) : null), [counties]);

  const [filters, setFilters, resetFilters] = useUrlFilters(countySet);
  const [layers, setLayers] = useReducer(merge, {
    heatmap: true,
    markers: true,
    baseMap: 'osm',
    ...initialOverlays,
  });
  const [panelOpen, setPanelOpen] = useState(true);

  const filtered = useMemo(() => filterSchools(schools, filters), [schools, filters]);

  // Count closed-tier schools before the excludeClosed toggle is applied,
  // so the toggle button always shows how many zero-out schools exist.
  const closingCount = useMemo(
    () =>
      filtered.filter((s) => {
        const tier = tierFor(s.projections?.get(filters.year));
        return tier && tier.id === 'closed';
      }).length,
    [filtered, filters.year],
  );

  // Apply the excludeClosed toggle as a secondary filter (#144).
  const visible = useMemo(
    () =>
      filters.excludeClosed
        ? filtered.filter((s) => {
            const tier = tierFor(s.projections?.get(filters.year));
            return !tier || tier.id !== 'closed';
          })
        : filtered,
    [filtered, filters.year, filters.excludeClosed],
  );

  const totals = useMemo(() => summarize(visible, filters.year), [visible, filters.year]);

  const overlayData = useMemo(
    () => ({ countyBoundary: countyBoundary.data }),
    [countyBoundary.data],
  );

  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'}>
      <a href="#main-content" className="skip-link">
        \u8df3\u5230\u4e3b\u5167\u5bb9
      </a>
      <header className="topbar">
        <div className="topbar__brand">
          <h1>\u5ee2\u6821\u9810\u8b66</h1>
          <p>
            \u4ee5 {BASE_YEAR} \u8207 {REFERENCE_YEAR} \u5b78\u5e74\u5ea6\u6559\u80b2\u90e8\u7d71\u8a08\u63a8\u4f30 {PROJECTION_YEARS.at(0)}\u2013
            {PROJECTION_YEARS.at(-1)} \u5b78\u5e74\u5ea6\u570b\u5c0f\u5b78\u751f\u4eba\u6578
          </p>
        </div>
        {status === 'ready' && (
          <SummaryBar
            totals={totals}
            year={filters.year}
            closingCount={closingCount}
            excludeClosed={filters.excludeClosed}
            onToggleClosed={() =>
              setFilters({ excludeClosed: !filters.excludeClosed })
            }
          />
        )}
        <button
          type="button"
          className="pill-button"
          aria-expanded={panelOpen}
          aria-controls="sidebar"
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? '\u6536\u5408\u5074\u6b04' : '\u5c55\u958b\u5074\u6b04'}
        </button>
      </header>

      <main id="main-content" className="stage" tabIndex={-1}>
        {status === 'loading' && (
          <p className="state" role="status">
            \u8f09\u5165\u5168\u53f0\u570b\u5c0f\u8cc7\u6599\u4e2d\u2026
          </p>
        )}

        {status === 'error' && (
          <div className="state state--error" role="alert">
            <p>{error?.message ?? '\u8cc7\u6599\u8f09\u5165\u5931\u6557'}</p>
            <button type="button" className="pill-button" onClick={reload}>
              \u91cd\u65b0\u8f09\u5165
            </button>
          </div>
        )}

        {status === 'ready' && (
          <ErrorBoundary>
            <SchoolMap
              schools={visible}
              year={filters.year}
              layers={layers}
              overlayData={overlayData}
            />

            {visible.length === 0 && (
              <p className="stage__empty" role="status">
                \u76ee\u524d\u7684\u7be9\u9078\u689d\u4ef6\u6c92\u6709\u7b26\u5408\u7684\u5b78\u6821\u3002
                <button
                  type="button"
                  className="stage__empty-reset"
                  onClick={resetFilters}
                >
                  \u6e05\u9664\u7be9\u9078
                </button>
              </p>
            )}

            <aside id="sidebar" className="sidebar" inert={!panelOpen || undefined}>
              <ControlPanel
                filters={filters}
                counties={counties}
                layers={layers}
                onChange={setFilters}
                onLayers={setLayers}
                onReset={resetFilters}
              />
              <Legend year={filters.year} />
            </aside>
          </ErrorBoundary>
        )}
      </main>

      <footer className="credits">
        \u8cc7\u6599\u4f86\u6e90\uff1a\u6559\u80b2\u90e8\u7d71\u8a08\u8655 \u30fb \u5c08\u6848\uff1a
        <a
          href="https://github.com/yellowsoar/small_school_renaissance"
          target="_blank"
          rel="noreferrer"
        >
          yellowsoar/small_school_renaissance
        </a>
      </footer>
    </div>
  );
}
