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

  // Note: the chips below each have their own `active`. This one is about the
  // panel as a whole, so it gets a distinct name rather than being shadowed.
  const hasFilters =
    filters.counties.size > 0 || filters.tiers.size > 0 || filters.search.trim() !== '';

  return (
    <form className="panel" onSubmit={(event) => event.preventDefault()}>
      <div className="panel__block">
        <label className="panel__label" htmlFor={yearId}>
          \u63a8\u4f30\u5b78\u5e74\u5ea6
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
        <legend className="panel__label">\u98a8\u96aa\u5206\u7d1a</legend>
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
          \u641c\u5c0b\u5b78\u6821 / \u9109\u93ae
        </label>
        <input
          id={searchId}
          type="search"
          className="panel__input"
          placeholder="\u4f8b\u5982\uff1a\u63d2\u89d2\u570b\u5c0f\u3001\u70cf\u4f86\u5340"
          maxLength={MAX_QUERY_LENGTH}
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </div>

      <fieldset className="panel__block">
        <legend className="panel__label">\u7e23\u5e02</legend>
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
          \u6e05\u9664\u7be9\u9078
        </button>
      )}

      <fieldset className="panel__block">
        <legend className="panel__label">\u5716\u5c64</legend>
        <div className="switches">
          {[
            ['heatmap', '\u71b1\u5340\u5716'],
            ['markers', '\u5b78\u6821\u9ede\u4f4d'],
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
        <fieldset className="panel__basemap">
          <legend className="panel__sublabel">\u5e95\u5716</legend>
          <div className="switches">
            {TILE_LAYERS.map((tile) => (
              <label key={tile.id} className="switch">
                <input
                  type="radio"
                  name="baseMap"
                  value={tile.id}
                  checked={layers.baseMap === tile.id}
                  onChange={() => onLayers({ baseMap: tile.id })}
                />
                <span>{tile.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="panel__block">
        <legend className="panel__label">\u758a\u5716\u5716\u5c64</legend>
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
