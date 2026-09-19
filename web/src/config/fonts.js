/**
 * Single source of truth for the Google Fonts stylesheet URL.
 * Used by main.jsx (runtime activation) and injected into index.html
 * (preload + noscript fallback) via the Vite transformIndexHtml plugin
 * in vite.config.js.  See #223.
 */
export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap';
