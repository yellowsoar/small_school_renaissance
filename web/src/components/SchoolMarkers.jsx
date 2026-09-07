import { Marker, Popup } from 'react-leaflet';
import { MAP } from '../config/index.js';
import { tierFor } from '../lib/schools.js';
import { iconFor } from '../lib/markerIcons.js';
import { useVisibleSchools } from '../hooks/useVisibleSchools.js';
import SchoolPopup from './SchoolPopup.jsx';

/** Stable identity, so toggling the layer off does not invalidate the memo. */
const NONE = [];

/**
 * Individual schools, limited to what is actually on screen. Below
 * MAP.markerZoom none are drawn: 2,600 glyphs at country scale are noise,
 * and the heatmap already answers "where are the small schools clustered".
 */
export default function SchoolMarkers({ schools, year, visible }) {
  const onScreen = useVisibleSchools(visible ? schools : NONE, MAP.markerZoom);

  return onScreen.map((school) => {
    const tier = tierFor(school.projections.get(year));
    if (!tier) return null;

    return (
      <Marker
        key={school.id}
        position={school.position}
        icon={iconFor(tier)}
        title={school.name}
        alt={`${school.name}（${tier.label}）`}
      >
        <Popup minWidth={260} maxWidth={320}>
          <SchoolPopup school={school} year={year} tier={tier} />
        </Popup>
      </Marker>
    );
  });
}
