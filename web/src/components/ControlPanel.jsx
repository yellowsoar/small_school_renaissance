import { useId } from 'react';
import { MAX_QUERY_LENGTH, OVERLAY_LAYERS, PROJECTION_YEARS, RISK_TIERS, TILE_LAYERS } from '../config/index.js';

const toggle = (set, value) => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

export default function ControlPanel({
  filters,
  counties,
  layers,
  onChange,
  onLayers,
  onReset,
}) {
  const yearId = useId();
  const searchId = useId();
  const baseMapId = useId();

  // Note: the chips below each have their own `active`. This one is about the
  // panel as a whole, so it gets a distinct name rather than being shadowed.
  const hasFilters =
    filters.counties.size > 0 || filters.tiers.size > 0 || filters.search.trim() !== '';

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
          maxLength={MAX_QUERY_LENGTH}
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

      {hasFilters && (
        <button type="button" className="panel__reset" onClick={onReset}>
          清除篩選
        </button>
      )}

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
        <div className="panel__basemap">
          <label className="panel__sublabel" htmlFor={baseMapId}>
            底圖
          </label>
          <select
            id={baseMapId}
            className="panel__select"
            value={layers.baseMap}
            onChange={(event) => onLayers({ baseMap: event.target.value })}
          >
            {TILE_LAYERS.map((tile) => (
              <option key={tile.id} value={tile.id}>
                {tile.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="panel__block">
        <legend className="panel__label">疊圖圖層</legend>
        <div className="switches">
          {OVERLAY_LAYERS.map((overlay) => (
            <label key={overlay.id} className="switch">
              <input
                type="checkbox"
                checked={layers[overlay.id] ?? false}
                onChange={(event) => onLayers({ [overlay.id]: event.target.checked })}
              />
              <span>{overlay.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
