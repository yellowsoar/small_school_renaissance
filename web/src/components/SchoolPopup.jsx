import { BASE_YEAR, REFERENCE_YEAR } from '../config/index.js';
import { isSafeUrl, normalizeUrl, dialable } from '../lib/sanitize.js';
import TrendSparkline from './TrendSparkline.jsx';

const integer = new Intl.NumberFormat('zh-Hant-TW');
const percent = new Intl.NumberFormat('zh-Hant-TW', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

const show = (value) => (value == null ? '\u2014' : integer.format(Math.round(value)));

export default function SchoolPopup({ school, year, tier }) {
  const projected = school.projections.get(year);
  const trendClass =
    school.delta == null ? '' : school.delta < 0 ? ' is-down' : ' is-up';

  return (
    <div>
      <header className="popup__head">
        <h3>{school.name}</h3>
        <p>
          {school.county} {school.town} \u30FB {school.remoteness}
        </p>
      </header>

      {school.unprojected ? (
        <p className="popup__headline popup__headline--muted">
          \u7F3A\u5C11 {REFERENCE_YEAR} \u5B78\u5E74\u5C0D\u7167\u8CC7\u6599\uFF0C\u7121\u6CD5\u63A8\u4F30
        </p>
      ) : (
        <>
          <p className="popup__headline" style={{ '--tier': tier?.color }}>
            <span>{year} \u5B78\u5E74\u63A8\u4F30</span>
            <strong>{show(projected)}</strong>
            <span>\u4EBA \u30FB {tier?.label ?? '\u7121\u63A8\u4F30'}</span>
          </p>
          <TrendSparkline
            projections={school.projections}
            year={year}
            color={tier?.color}
          />
        </>
      )}

      <dl className="popup__grid">
        <div>
          <dt>{BASE_YEAR} \u5B78\u5E74</dt>
          <dd>{show(school.enrollment)}</dd>
        </div>
        <div>
          <dt>{REFERENCE_YEAR} \u5B78\u5E74</dt>
          <dd>{show(school.reference)}</dd>
        </div>
        <div>
          <dt>\u4EBA\u6578\u5DEE\u7570</dt>
          <dd className={`popup__trend${trendClass}`}>
            {school.delta == null
              ? '\u2014'
              : `${school.delta > 0 ? '+' : ''}${integer.format(school.delta)}`}
          </dd>
        </div>
        <div>
          <dt>\u8B8A\u5316\u5E45\u5EA6</dt>
          <dd className={`popup__trend${trendClass}`}>
            {school.deltaRatio == null ? '\u2014' : percent.format(school.deltaRatio)}
          </dd>
        </div>
      </dl>

      {school.address && <p className="popup__meta">{school.address}</p>}

      <p className="popup__links">
        {school.website && isSafeUrl(school.website) && (
          <a href={normalizeUrl(school.website)} target="_blank" rel="noreferrer">
            \u5B78\u6821\u7DB2\u7AD9 \u2197
          </a>
        )}
        {school.phone && (() => {
          const number = dialable(school.phone);
          return number ? (
            <a href={`tel:${number}`}>{school.phone}</a>
          ) : null;
        })()}
      </p>
    </div>
  );
}
