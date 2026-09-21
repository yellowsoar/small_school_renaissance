import { heatLayer } from '@linkurious/leaflet-heat';

/**
 * Abstraction layer around @linkurious/leaflet-heat.
 *
 * Centralises the dependency so consumers (HeatmapLayer) never import
 * the heat plugin directly.  When a maintained replacement is available,
 * only this file needs to change (#240).
 *
 * @param {object} options \u2013 Leaflet.heat layer options (radius, blur, \u2026)
 * @returns {{ addTo(map: L.Map): object, setLatLngs(latlngs: Array): void, remove(): void }}
 */
export function createHeatLayer(options) {
  return heatLayer([], options);
}
