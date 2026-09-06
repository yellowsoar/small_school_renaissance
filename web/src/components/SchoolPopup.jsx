import { BASE_YEAR, REFERENCE_YEAR } from '../config/index.js';

const integer = new Intl.NumberFormat('zh-Hant-TW');
const percent = new Intl.NumberFormat('zh-Hant-TW', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

const show = (value) => (value == null ? '—' : integer.format(Math.round(value)));

export default function SchoolPopup({ school, year, tier }) {
  const projected = school.projections.get(year);
  const trendClass =
    school.delta == null ? '' : school.delta < 0 ? ' is-down' : ' is-up';

  return (
    <div>
      <header className="popup__head">
        <h3>{school.name}</h3>
        <p>
          {school.county} {school.town} ・ {school.remoteness}
        </p>
      </header>

      {school.unprojected ? (
        <p className="popup__headline popup__headline--muted">
          缺少 {REFERENCE_YEAR} 學年對照資料，無法推估
        </p>
      ) : (
        <p className="popup__headline" style={{ '--tier': tier?.color }}>
          <span>{year} 學年推估</span>
          <strong>{show(projected)}</strong>
          <span>人 ・ {tier?.label ?? '無推估'}</span>
        </p>
      )}

      <dl className="popup__grid">
        <div>
          <dt>{BASE_YEAR} 學年</dt>
          <dd>{show(school.enrollment)}</dd>
        </div>
        <div>
          <dt>{REFERENCE_YEAR} 學年</dt>
          <dd>{show(school.reference)}</dd>
        </div>
        <div>
          <dt>人數差異</dt>
          <dd className={`popup__trend${trendClass}`}>
            {school.delta == null
              ? '—'
              : `${school.delta > 0 ? '+' : ''}${integer.format(school.delta)}`}
          </dd>
        </div>
        <div>
          <dt>變化幅度</dt>
          <dd className={`popup__trend${trendClass}`}>
            {school.deltaRatio == null ? '—' : percent.format(school.deltaRatio)}
          </dd>
        </div>
      </dl>

      {school.address && <p className="popup__meta">{school.address}</p>}

      <p className="popup__links">
        {school.website && (
          <a href={school.website} target="_blank" rel="noreferrer">
            學校網站 ↗
          </a>
        )}
        {school.phone && (
          <a href={`tel:${school.phone.replace(/[^\d+]/g, '')}`}>{school.phone}</a>
        )}
      </p>
    </div>
  );
}
