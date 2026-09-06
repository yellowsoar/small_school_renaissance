import { useId } from 'react';
import { PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';

const toggle = (set, value) => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

export default function ControlPanel({ filters, counties, layers, onChange, onLayers }) {
  const yearId = useId();
  const searchId = useId();

  return (
    <form className="panel" onSubmit={(event) => event.preventDefault()}>
      <div className="panel__block">
        <label className="panel__label" htmlFor={yearId}>
          推估學年度
          <output className="panel__year">{filters.year}</output>
        </label>
        <input
          id={yearId}
          type="range"
          min={PROJECTION_YEARS.at(0)}
          max={PROJECTION_YEARS.at(-1)}
          step={1}
          value={filters.year}
          onChange={(event) => onChange({ year: Number(event.target.value) })}
        />
        <div className="panel__ticks" aria-hidden="true">
          <span>{PROJECTION_YEARS.at(0)}</span>
          <span>{PROJECTION_YEARS.at(-1)}</span>
        </div>
      </div>

      <fieldset className="panel__block">
        <legend className="panel__label">風險分級</legend>
        <div className="chips">
          {RISK_TIERS.map((tier) => {
            const active = filters.tiers.has(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                className="chip"
                data-active={active}
                style={{ '--chip': tier.color }}
                aria-pressed={active}
                onClick={() => onChange({ tiers: toggle(filters.tiers, tier.id) })}
              >
                {tier.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="panel__block">
        <label className="panel__label" htmlFor={searchId}>
          搜尋學校 / 鄉鎮
        </label>
        <input
          id={searchId}
          type="search"
          className="panel__input"
          placeholder="例如：插角國小、烏來區"
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </div>

      <fieldset className="panel__block">
        <legend className="panel__label">縣市</legend>
        <div className="chips chips--scroll">
          {counties.map((county) => {
            const active = filters.counties.has(county);
            return (
              <button
                key={county}
                type="button"
                className="chip chip--plain"
                data-active={active}
                aria-pressed={active}
                onClick={() => onChange({ counties: toggle(filters.counties, county) })}
              >
                {county}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="panel__block">
        <legend className="panel__label">圖層</legend>
        <div className="switches">
          {[
            ['heatmap', '熱區圖'],
            ['markers', '學校點位'],
          ].map(([key, label]) => (
            <label key={key} className="switch">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(event) => onLayers({ [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
