const integer = new Intl.NumberFormat('zh-Hant-TW');

export default function SummaryBar({ totals, year }) {
  const stats = [
    ['符合條件學校', totals.schools],
    [`${year} 學年推估歸零`, totals.closing],
    ['50 人以下（含歸零）', totals.atRisk],
    ['推估學生總數', totals.students],
  ];

  // The figures recompute as the slider and filters move, so a screen reader
  // needs to be told; polite, because they change on every slider step.
  return (
    <dl className="summary" aria-live="polite" aria-atomic="true">
      {stats.map(([label, value]) => (
        <div key={label} className="summary__item">
          <dt>{label}</dt>
          <dd>{integer.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
