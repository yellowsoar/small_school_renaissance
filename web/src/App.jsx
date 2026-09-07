import { useMemo, useReducer, useState } from 'react';
import { BASE_YEAR, REFERENCE_YEAR, PROJECTION_YEARS } from './config/index.js';
import { filterSchools, summarize } from './lib/schools.js';
import { useSchoolData } from './hooks/useSchoolData.js';
import { useUrlFilters } from './hooks/useUrlFilters.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SchoolMap from './components/SchoolMap.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import Legend from './components/Legend.jsx';

const merge = (state, patch) => ({ ...state, ...patch });

export default function App() {
  const { status, schools, counties, error, reload } = useSchoolData();

  // Stable for the lifetime of a loaded dataset, which is what lets
  // useUrlFilters re-validate the URL's counties exactly once.
  const countySet = useMemo(() => (counties.length ? new Set(counties) : null), [counties]);

  const [filters, setFilters, resetFilters] = useUrlFilters(countySet);
  const [layers, setLayers] = useReducer(merge, { heatmap: true, markers: true });
  const [panelOpen, setPanelOpen] = useState(true);

  const visible = useMemo(() => filterSchools(schools, filters), [schools, filters]);
  const totals = useMemo(() => summarize(visible, filters.year), [visible, filters.year]);

  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'}>
      <header className="topbar">
        <div className="topbar__brand">
          <h1>廢校預警</h1>
          <p>
            以 {BASE_YEAR} 與 {REFERENCE_YEAR} 學年度教育部統計推估 {PROJECTION_YEARS.at(0)}–
            {PROJECTION_YEARS.at(-1)} 學年度國小學生人數
          </p>
        </div>
        {status === 'ready' && <SummaryBar totals={totals} year={filters.year} />}
        <button
          type="button"
          className="pill-button"
          aria-expanded={panelOpen}
          aria-controls="sidebar"
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? '收合側欄' : '展開側欄'}
        </button>
      </header>

      <main className="stage">
        {status === 'loading' && (
          <p className="state" role="status">
            載入全台國小資料中…
          </p>
        )}

        {status === 'error' && (
          <div className="state state--error" role="alert">
            <p>{error?.message ?? '資料載入失敗'}</p>
            <button type="button" className="pill-button" onClick={reload}>
              重新載入
            </button>
          </div>
        )}

        {status === 'ready' && (
          <ErrorBoundary>
            <SchoolMap schools={visible} year={filters.year} layers={layers} />

            {visible.length === 0 && (
              <p className="stage__empty" role="status">
                目前的篩選條件沒有符合的學校。
                <button
                  type="button"
                  className="stage__empty-reset"
                  onClick={resetFilters}
                >
                  清除篩選
                </button>
              </p>
            )}

            <aside id="sidebar" className="sidebar">
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
        資料來源：教育部統計處 ・ 專案：
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
