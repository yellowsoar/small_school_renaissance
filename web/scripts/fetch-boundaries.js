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
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
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
const trustFirst = process.argv.includes('--trust-first');

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

/**
 * Prompt for explicit opt-in before auto-trusting downloaded data (#383).
 *
 * Returns true immediately when:
 * - --trust-first flag is set (explicit automation opt-in)
 * - stdout is not a TTY (non-interactive: Docker, piped scripts, etc.)
 *
 * In interactive TTY mode, asks the developer to confirm [y/N] after
 * reviewing the data preview printed by autoBootstrap().
 *
 * @returns {Promise<boolean>} true if the developer approves auto-trust
 */
const confirmTrust = async () => {
  if (trustFirst || !process.stdout.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question('Auto-trust this download? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    }),
  );
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
 * Auto-bootstrap the boundary integrity hash for local development (#381, #383).
 *
 * Like the CSV integrity flow, boundary data auto-bootstrap fires
 * only outside CI for developer convenience.  In TTY mode the developer
 * must confirm [y/N]; in non-TTY mode or with --trust-first, confirmation
 * is implicit to preserve backward compatibility.  Once a verified hash
 * is committed via update-integrity.yml, verification becomes strict:
 * mismatches always fail-closed.
 *
 * @param {string} reason - human-readable explanation for the warning
 */
const autoBootstrap = async (reason) => {
  console.warn(
    `\u26a0\ufe0f  ${reason} \u2014 auto-bootstrapping for local development.\n` +
    '   Commit a verified hash with --update-integrity for production use.',
  );
  const trusted = await confirmTrust();
  if (!trusted) {
    console.error(
      '\u274c Aborted. Use --update-integrity after manual verification, ' +
      'or --trust-first to bypass the prompt.',
    );
    process.exit(1);
  }
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
  // Verify against the stored hash — fail-closed by default (#381).
  // Missing, empty, or unreadable integrity metadata aborts the build
  // in CI; outside CI it auto-bootstraps for developer convenience.
  // Use --skip-integrity to opt out during local development.
  let needsBootstrap = false;
  let bootstrapReason = '';

  try {
    const raw = await readFile(integrityPath, 'utf-8');
    const { sha256: expectedHash } = JSON.parse(raw);

    if (!expectedHash) {
      if (process.env.CI) {
        console.error(
          '\u274c boundary-integrity.json sha256 is empty. Run with --update-integrity after verifying the upstream data, or use --skip-integrity for local development.',
        );
        process.exit(1);
      }
      needsBootstrap = true;
      bootstrapReason = 'boundary-integrity.json sha256 is empty';
    } else {
      verifyIntegrity(body, expectedHash);
      console.log('\u2705 boundary integrity verified (sha256 match)');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (process.env.CI) {
        console.error(
          '\u274c boundary-integrity.json not found. Run with --update-integrity to create it, or use --skip-integrity for local development.',
        );
        process.exit(1);
      }
      needsBootstrap = true;
      bootstrapReason = 'boundary-integrity.json not found';
    } else if (err.message.includes('integrity check failed')) {
      // Real integrity mismatch: always fail-closed, all environments.
      console.error(`\u274c ${err.message}`);
      process.exit(1);
    } else {
      // Malformed JSON, unexpected read error, etc.
      if (process.env.CI) {
        console.error(`\u274c could not read boundary-integrity.json: ${err.message}. Use --skip-integrity to bypass.`);
        process.exit(1);
      }
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
