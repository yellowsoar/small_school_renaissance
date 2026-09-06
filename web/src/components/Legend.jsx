import { RISK_TIERS } from '../config/index.js';
import TierGlyph from './TierGlyph.jsx';

export default function Legend({ year }) {
  return (
    <aside className="legend" aria-label="圖例">
      <h2 className="legend__title">{year} 學年推估分級</h2>
      <ul className="legend__list">
        {RISK_TIERS.map((tier) => (
          <li key={tier.id}>
            <span className="legend__glyph">
              <TierGlyph shape={tier.shape} color={tier.color} size={16} />
            </span>
            <span className="legend__label">{tier.label}</span>
            <span className="legend__range">{tier.describe()}</span>
          </li>
        ))}
      </ul>
      <p className="legend__note">
        熱區顏色代表 100 人以下學校的密集程度，紅 &gt; 橘 &gt; 黃。放大到街廓層級才會顯示個別學校點位。
      </p>
    </aside>
  );
}
