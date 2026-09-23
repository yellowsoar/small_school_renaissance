import { heatLayer } from 'leaflet-heatmap-layer';

/**
 * Abstraction layer around leaflet-heatmap-layer (formerly @linkurious/leaflet-heat).
 *
 * Centralises the dependency so consumers (HeatmapLayer) never import
 * the heat plugin directly.  Replaced @linkurious/leaflet-heat with
 * leaflet-heatmap-layer for active maintenance (#316, #240).
 *
 * Compatibility defaults ensure identical rendering behaviour:
 * - max: 1.0        — original default; leaflet-heatmap-layer auto-computes
 * - scaleRadius: 0  — disable per-zoom radius scaling (not in original)
 * - zoomCrossfadeDuration: 0 — disable crossfade animation (not in original)
 *
 * @param {object} options – Leaflet heatmap layer options (radius, blur, …)
 * @returns {{ addTo(map: L.Map): object, setLatLngs(latlngs: Array): void, remove(): void }}
 */
export function createHeatLayer(options) {
  // Defensive copy: prevent the plugin from mutating shared config (#284).
  const isolated = {
    // Compatibility defaults for leaflet-heatmap-layer (#316).
    max: 1.0,
    scaleRadius: 0,
    zoomCrossfadeDuration: 0,
    ...options,
  };
  if (options.gradient) {
    isolated.gradient = { ...options.gradient };
  }
  return heatLayer([], isolated);
}
