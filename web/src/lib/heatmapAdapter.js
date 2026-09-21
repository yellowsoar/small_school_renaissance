import L from 'leaflet';
import 'leaflet.heat';

/**
 * Abstraction layer around leaflet.heat.
 *
 * Centralises the dependency so consumers (HeatmapLayer) never import
 * leaflet.heat directly.  When a maintained replacement is available,
 * only this file needs to change (#240).
 *
 * @param {object} options – Leaflet.heat layer options (radius, blur, …)
 * @returns {{ addTo(map: L.Map): object, setLatLngs(latlngs: Array): void, remove(): void }}
 */
export function createHeatLayer(options) {
  return L.heatLayer([], options);
}
