import { heatLayer } from '@linkurious/leaflet-heat';

/**
 * Abstraction layer around @linkurious/leaflet-heat.
 *
 * Centralises the dependency so consumers (HeatmapLayer) never import
 * the heat plugin directly.  When a maintained replacement is available,
 * only this file needs to change (#240).
 *
 * @param {object} options – Leaflet.heat layer options (radius, blur, …)
 * @returns {{ addTo(map: L.Map): object, setLatLngs(latlngs: Array): void, remove(): void }}
 */
export function createHeatLayer(options) {
  // Defensive copy: prevent the plugin from mutating shared config (#284).
  const isolated = { ...options };
  if (options.gradient) {
    isolated.gradient = { ...options.gradient };
  }
  return heatLayer([], isolated);
}
