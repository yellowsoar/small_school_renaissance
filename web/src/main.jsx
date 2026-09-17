import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import App from './App.jsx';

// Activate the preloaded Google Fonts stylesheet without blocking rendering.
// The <link rel="preload"> in index.html downloads the CSS early; this
// converts it into an active stylesheet after the app module loads.  (#61)
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap';
document.head.appendChild(fontLink);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
