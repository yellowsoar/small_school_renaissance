#!/usr/bin/env node
/**
 * Pulls the county boundary GeoJSON into public/data/ so the app serves it
 * as a static asset for the overlay layer.
 *
 * Source: ronnywang/twgeojson simplified GeoJSON (CC0 license, ~362KB).
 * Configurable via BOUNDARY_SOURCE_URL environment variable.
 *
 * Usage: node scripts/fetch-boundaries.js [--force] [--update-integrity] [--skip-integrity] [--trust-first]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithRetry } from './fetch-utils.js';
import { redactUrl, fileExists, atomicWriteFile, runIntegrityFlow } from './integrity-utils.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Node >= 20.12 can read .env natively; missing file is not an error here.
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.warn(`\u26a0\ufe0f  .env load error: ${err.message}`);
  }
}

const SOURCE_URL =
  process.env.BOUNDARY_SOURCE_URL ||
  'https://raw.githubusercontent.com/ronnywang/twgeojson/master/twcounty2010.3.json';

const target = resolve(root, 'public/data/county-boundaries.geojson');
const integrityPath = resolve(root, 'boundary-integrity.json');
const force = process.argv.includes('--force');
const updateIntegrity = process.argv.includes('--update-integrity');
const skipIntegrity = process.argv.includes('--skip-integrity');
const trustFirst = process.argv.includes('--trust-first');

if (!force && !updateIntegrity && (await fileExists(target))) {
  console.log(
    '\u2705 county boundary data already present, skipping download (use --force to refresh)',
  );
  process.exit(0);
}

console.log(`\u2699\ufe0f  downloading boundary data from ${redactUrl(SOURCE_URL)}`);

/** Maximum boundary file size: 5 MB (the simplified file is ~362KB). */
const MAX_BOUNDARY_BYTES = 5 * 1024 * 1024;

let body;
try {
  const result = await fetchWithRetry(SOURCE_URL, {
    maxBytes: MAX_BOUNDARY_BYTES,
  });
  body = result.body;
} catch (err) {
  const detail =
    err.name === 'TimeoutError' ? 'timeout after 30s' : err.message;
  console.error(
    `\u274c boundary data download failed after 3 attempts: ${detail}`,
  );
  process.exit(1);
}

// Validate GeoJSON structure
try {
  const parsed = JSON.parse(body);
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error(`expected FeatureCollection, got type="${parsed.type}"`);
  }
  console.log(
    `\u2705 valid GeoJSON FeatureCollection (${parsed.features.length} features)`,
  );
} catch (err) {
  if (err instanceof SyntaxError) {
    console.error('\u274c downloaded content is not valid JSON');
  } else {
    console.error(`\u274c invalid GeoJSON: ${err.message}`);
  }
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Integrity verification (#355)                                       */
/* ------------------------------------------------------------------ */

await runIntegrityFlow({
  body,
  integrityPath,
  label: 'boundary',
  updateIntegrity,
  skipIntegrity,
  trustFirst,
});

await atomicWriteFile(target, body);
console.log(`\u2705 saved to ${target}`);
