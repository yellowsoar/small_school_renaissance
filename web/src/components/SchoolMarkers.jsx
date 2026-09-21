import { useEffect, useRef } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { MAP } from '../config/index.js';
import { tierFor } from '../lib/schools.js';
import { iconFor } from '../lib/markerIcons.js';
import { useVisibleSchools } from '../hooks/useVisibleSchools.js';
import SchoolPopup from './SchoolPopup.jsx';

/** Stable identity, so toggling the layer off does not invalidate the memo. */
const NONE = [];

/**
 * Wrapper that re-applies keyboard a11y attributes after Leaflet's
 * setIcon() replaces the DOM element.
 *
 * Coupling assumption: iconFor(tier) caches by tier.id, and ariaLabel
 * contains tier.label. Every setIcon() DOM swap (tier change) therefore
 * produces a new ariaLabel, so [ariaLabel] as the dependency array is
 * sufficient to catch all DOM replacements. If icon derivation is ever
 * decoupled from ariaLabel, revert to a deps-free effect or
 * MutationObserver (#255).
 */
function AccessibleMarker({ position, icon, title, alt, ariaLabel, children }) {
  const markerRef = useRef(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;

    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', ariaLabel);

    const onKeydown = (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        marker.openPopup();
      }
    };
    el.addEventListener('keydown', onKeydown);

    return () => {
      el.removeEventListener('keydown', onKeydown);
    };
  }, [ariaLabel]); // re-runs on tier change, which also triggers setIcon() DOM swap

  return (
    <Marker ref={markerRef} position={position} icon={icon} title={title} alt={alt}>
      {children}
    </Marker>
  );
}

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

    const ariaLabel = `${school.name}\uff08${tier.label}\uff09`;

    return (
      <AccessibleMarker
        key={school.id}
        position={school.position}
        icon={iconFor(tier)}
        title={school.name}
        alt={ariaLabel}
        ariaLabel={ariaLabel}
      >
        <Popup minWidth={260} maxWidth={320}>
          <SchoolPopup school={school} year={year} tier={tier} />
        </Popup>
      </AccessibleMarker>
    );
  });
}
