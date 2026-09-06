import { useMemo, useReducer, useState } from 'react';
import { BASE_YEAR, PROJECTION_YEARS, REFERENCE_YEAR } from './config/index.js';
import { filterSchools, summarize } from './lib/schools.js';
import { useSchoolData } from './hooks/useSchoolData.js';
import SchoolMap from './components/SchoolMap.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import Legend from './components/Legend.jsx';

const initialFilters = {
  year: PROJECTION_YEARS.at(-1),
  counties: new Set(),
  tiers: new Set(),
  search: '',
};

const merge = (state, patch) => ({ ...state, ...patch });

export default function App() {
  const { status, schools, counties, error } = useSchoolData();
  const [filters, setFilters] = useReducer(merge, initialFilters);
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
          className="topbar__toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? '收合篩選' : '展開篩選'}
        </button>
      </header>

      <main className="stage">
        {status === 'loading' && (
          <p className="state" role="status">
            載入全台國小資料中…
          </p>
        )}

        {status === 'error' && (
          <p className="state state--error" role="alert">
            {error?.message ?? '資料載入失敗'}
            <br />
            <small>請先執行 <code>npm run fetch:data</code> 取得資料集。</small>
          </p>
        )}

        {status === 'ready' && (
          <>
            <SchoolMap schools={visible} year={filters.year} layers={layers} />
            <aside className="sidebar">
              <ControlPanel
                filters={filters}
                counties={counties}
                layers={layers}
                onChange={setFilters}
                onLayers={setLayers}
              />
              <Legend year={filters.year} />
            </aside>
          </>
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
