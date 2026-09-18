import { RISK_TIERS } from '../config/index.js';
import { useDebouncedAnnounce } from '../hooks/useDebouncedAnnounce.js';

const integer = new Intl.NumberFormat('zh-Hant-TW');
const AT_RISK_MAX = RISK_TIERS.find((t) => t.id === 'high').max;

const handleToggleKeyDown = (callback) => (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
};

export default function SummaryBar({
  totals,
  year,
  closingCount,
  excludeClosed,
  onToggleClosed,
}) {
  const atRiskLabel = excludeClosed
    ? `${AT_RISK_MAX} 人以下（不含歸零）`
    : `${AT_RISK_MAX} 人以下（含歸零）`;

  const stats = [
    { label: '符合條件學校', value: totals.schools },
    { label: `${year} 學年推估歸零`, value: closingCount, toggle: true },
    { label: atRiskLabel, value: totals.atRisk },
    { label: '推估學生總數', value: totals.students },
  ];

  if (totals.unprojected > 0) {
    stats.push({ label: '其中無推估資料', value: totals.unprojected });
  }

  const closedNote = excludeClosed ? '（已排除）' : '';
  const summaryParts = [
    `${year} 學年`,
    `${integer.format(totals.schools)} 校`,
    `推估歸零 ${integer.format(closingCount)} 校${closedNote}`,
    `${AT_RISK_MAX} 人以下 ${integer.format(totals.atRisk)} 校`,
    `推估學生 ${integer.format(totals.students)} 人`,
  ];

  if (totals.unprojected > 0) {
    summaryParts.push(`無推估資料 ${integer.format(totals.unprojected)} 校`);
  }

  const summary = summaryParts.join('、');
  const announced = useDebouncedAnnounce(summary);

  return (
    <>
      <dl className="summary">
        {stats.map(({ label, value, toggle }) =>
          toggle ? (
            <div
              key={label}
              className={`summary__item summary__toggle${excludeClosed ? ' summary__toggle--excluded' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={!excludeClosed}
              title={
                excludeClosed
                  ? '點擊以在地圖上顯示推估歸零學校'
                  : '點擊以從地圖上隱藏推估歸零學校'
              }
              onClick={onToggleClosed}
              onKeyDown={handleToggleKeyDown(onToggleClosed)}
            >
              <dt>{label}</dt>
              <dd>{integer.format(value)}</dd>
            </div>
          ) : (
            <div key={label} className="summary__item">
              <dt>{label}</dt>
              <dd>{integer.format(value)}</dd>
            </div>
          ),
        )}
      </dl>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announced}
      </div>
    </>
  );
}
