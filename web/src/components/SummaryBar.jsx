import { useDebouncedAnnounce } from '../hooks/useDebouncedAnnounce.js';

const integer = new Intl.NumberFormat('zh-Hant-TW');

export default function SummaryBar({ totals, year }) {
  const stats = [
    ['符合條件學校', totals.schools],
    [`${year} 學年推估歸零`, totals.closing],
    ['50 人以下（含歸零）', totals.atRisk],
    ['推估學生總數', totals.students],
  ];

  // Build a concise summary for the live region.  The visible <dl> updates
  // instantly for sighted users; the hidden live region only fires once the
  // slider has been idle for 400 ms, preventing screen-reader flood.
  const summary = [
    `${year} 學年`,
    `${integer.format(totals.schools)} 校`,
    `推估歸零 ${integer.format(totals.closing)} 校`,
    `50 人以下 ${integer.format(totals.atRisk)} 校`,
    `推估學生 ${integer.format(totals.students)} 人`,
  ].join('、');

  const announced = useDebouncedAnnounce(summary);

  return (
    <>
      <dl className="summary">
        {stats.map(([label, value]) => (
          <div key={label} className="summary__item">
            <dt>{label}</dt>
            <dd>{integer.format(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announced}
      </div>
    </>
  );
}
