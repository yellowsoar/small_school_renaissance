#!/usr/bin/env node
/**
 * Pulls the county boundary GeoJSON into public/data/ so the app serves it
 * as a static asset for the overlay layer.
 *
 * Source: ronnywang/twgeojson simplified GeoJSON (CC0 license, ~362KB).
 * Configurable via BOUNDARY_SOURCE_URL environment variable.
 *
 * Usage: node scripts/fetch-boundaries.js [--force] [--update-integrity] [--skip-integrity]
 */
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithRetry, verifyIntegrity } from './fetch-utils.js';

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

/**
 * Return a redacted URL safe for build logs.
 * @param {string} url
 * @returns {string}
 */
const redactUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(invalid URL)';
  }
};

const exists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

if (!force && !updateIntegrity && (await exists(target))) {
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

/**
 * Auto-bootstrap the boundary integrity hash.
 *
 * Unlike the CSV integrity flow, boundary data is auxiliary so
 * auto-bootstrap fires in ALL environments (no CI guard).  Once a
 * verified hash is committed via update-integrity.yml, verification
 * becomes strict: mismatches always fail-closed.
 *
 * @param {string} reason - human-readable explanation for the warning
 */
const autoBootstrap = async (reason) => {
  console.warn(
    `\u26a0\ufe0f  ${reason} \u2014 auto-bootstrapping.\n` +
    '   Commit a verified hash with --update-integrity for production use.',
  );
  const hash = verifyIntegrity(body);
  await writeFile(integrityPath, JSON.stringify({ sha256: hash }, null, 2) + '\n', 'utf-8');
  console.log(`\u2705 boundary-integrity.json bootstrapped (sha256: ${hash})`);
};

if (updateIntegrity) {
  // Compute and persist the hash for the just-validated GeoJSON.
  const hash = verifyIntegrity(body);
  await writeFile(integrityPath, JSON.stringify({ sha256: hash }, null, 2) + '\n', 'utf-8');
  console.log(`\u2705 boundary-integrity.json updated (sha256: ${hash})`);
} else if (!skipIntegrity) {
  // Verify against the stored hash.
  // Missing, empty, or unreadable integrity metadata auto-bootstraps
  // in all environments (boundary data is auxiliary, not core).
  // Hash mismatch always fails closed.
  let needsBootstrap = false;
  let bootstrapReason = '';

  try {
    const raw = await readFile(integrityPath, 'utf-8');
    const { sha256: expectedHash } = JSON.parse(raw);

    if (!expectedHash) {
      needsBootstrap = true;
      bootstrapReason = 'boundary-integrity.json sha256 is empty';
    } else {
      verifyIntegrity(body, expectedHash);
      console.log('\u2705 boundary integrity verified (sha256 match)');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      needsBootstrap = true;
      bootstrapReason = 'boundary-integrity.json not found';
    } else if (err.message.includes('integrity check failed')) {
      // Real integrity mismatch: always fail-closed, all environments.
      console.error(`\u274c ${err.message}`);
      process.exit(1);
    } else {
      // Malformed JSON, unexpected read error, etc.
      needsBootstrap = true;
      bootstrapReason = `could not read boundary-integrity.json (${err.message})`;
    }
  }

  if (needsBootstrap) {
    await autoBootstrap(bootstrapReason);
  }
}

// Atomic write (same pattern as fetch-data.js)
const tmpTarget = `${target}.tmp`;
await mkdir(dirname(target), { recursive: true });
try {
  await writeFile(tmpTarget, body, 'utf-8');
  await rename(tmpTarget, target);
} catch (err) {
  try {
    await unlink(tmpTarget);
  } catch {
    /* ENOENT is expected if writeFile() itself failed */
  }
  throw err;
}
console.log(`\u2705 saved to ${target}`);
