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
 * Uses a ref to track the current DOM element and ariaLabel, skipping
 * redundant DOM writes when neither has changed (#243).
 */
function AccessibleMarker({ position, icon, title, alt, ariaLabel, children }) {
  const markerRef = useRef(null);
  const setupRef = useRef(null);

  // Detect setIcon() DOM swaps and ariaLabel changes — still runs every
  // render, but skips DOM work when nothing changed.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;

    const prev = setupRef.current;

    // Same element, same ariaLabel — nothing to do
    if (prev && prev.el === el && prev.ariaLabel === ariaLabel) return;

    // Element changed (setIcon DOM swap) — tear down old listener
    if (prev && prev.el !== el && prev.handler) {
      prev.el.removeEventListener('keydown', prev.handler);
    }

    // Only ariaLabel changed on the same element — update attribute only
    if (prev && prev.el === el) {
      el.setAttribute('aria-label', ariaLabel);
      setupRef.current = { ...prev, ariaLabel };
      return;
    }

    // Full setup: new element or first mount
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

    setupRef.current = { el, handler: onKeydown, ariaLabel };
  }); // no deps — runs after every render to catch setIcon() DOM swaps

  // Unmount-only cleanup
  useEffect(() => {
    return () => {
      const prev = setupRef.current;
      if (prev && prev.el && prev.handler) {
        prev.el.removeEventListener('keydown', prev.handler);
      }
    };
  }, []);

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
