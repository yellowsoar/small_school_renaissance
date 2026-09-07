import { sparkline, toPolyline } from '../lib/sparkline.js';

// Rendered at its intrinsic size and allowed to scale uniformly. Stretching
// the viewBox instead (preserveAspectRatio="none") would squash the highlight
// dot into an ellipse.
const WIDTH = 228;
const HEIGHT = 36;

const integer = new Intl.NumberFormat('zh-Hant-TW');

/**
 * The whole 114–130 curve for one school, so the popup shows a trajectory
 * rather than a single year lifted out of context.
 */
export default function TrendSparkline({ projections, year, color }) {
  const curve = sparkline(projections, { width: WIDTH, height: HEIGHT, highlight: year });
  if (!curve) return null;

  const stroke = color ?? 'currentColor';

  return (
    <figure className="spark">
      <svg
        className="spark__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={
          `${curve.firstYear} 至 ${curve.lastYear} 學年推估趨勢：` +
          `由 ${integer.format(Math.round(curve.first))} 人變為 ` +
          `${integer.format(Math.round(curve.last))} 人`
        }
      >
        <polyline
          points={toPolyline(curve.points)}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {curve.highlighted && (
          <circle cx={curve.highlighted[0]} cy={curve.highlighted[1]} r="3" fill={stroke} />
        )}
      </svg>
      <figcaption className="spark__axis" aria-hidden="true">
        <span>{curve.firstYear}</span>
        <span>{curve.lastYear}</span>
      </figcaption>
    </figure>
  );
}
