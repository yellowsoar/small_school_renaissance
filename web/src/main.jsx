import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import App from './App.jsx';
import { GOOGLE_FONTS_URL } from './config/fonts.js';

// Activate the preloaded Google Fonts stylesheet without blocking rendering.
// The <link rel="preload"> in index.html downloads the CSS early; this
// converts it into an active stylesheet after the app module loads.  (#61)
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = GOOGLE_FONTS_URL;
document.head.appendChild(fontLink);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
