#!/usr/bin/env node
/**
 * Pulls the source dataset into public/data/ so the app serves it as a static
 * asset instead of hot-linking GitHub.
 *
 * Upstream is yellowsoar/small_school_renaissance. That repo does not carry the
 * dataset yet, so DATA_BRANCH defaults to the g0v mirror it was forked from.
 * Once docs/113-107.csv lands on this fork, drop DATA_OWNER/DATA_BRANCH or set
 * them to yellowsoar / gh-pages.
 *
 * Configuration lives in .env — see .env.example. Real environment variables
 * always take precedence over the file.
 *
 * Usage: node scripts/fetch-data.js [--force] [--update-integrity] [--skip-integrity]
 */
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithRetry, validateCsvContent, verifyCsvIntegrity, summarizeCsvForReview } from './fetch-utils.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Node >= 20.12 can read .env natively; missing file is not an error here.
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch (err) {
  // ENOENT = .env does not exist, safe to ignore (CI / production).
  // Any other error (parse failure, EACCES, etc.) deserves a warning
  // so the developer knows their .env was not applied.
  if (err.code !== 'ENOENT') {
    console.warn(`\u26a0\ufe0f  .env load error: ${err.message}`);
  }
}

const DATA_OWNER = process.env.DATA_OWNER ?? 'g0v';
const DATA_REPO = process.env.DATA_REPO ?? 'small_school_renaissance';
const DATA_BRANCH = process.env.DATA_BRANCH ?? 'gh-pages';
const DATA_PATH = process.env.DATA_PATH ?? 'docs/113-107.csv';

// Use || instead of ?? so an empty string (injected by GitHub Actions when
// vars.DATA_SOURCE_URL is unset) also falls back to the composed URL.
const SOURCE_URL =
  process.env.DATA_SOURCE_URL ||
  `https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/${DATA_BRANCH}/${DATA_PATH}`;

const target = resolve(root, 'public/data/113-107.csv');
const integrityPath = resolve(root, 'data-integrity.json');
const force = process.argv.includes('--force');
const updateIntegrity = process.argv.includes('--update-integrity');
const skipIntegrity = process.argv.includes('--skip-integrity');

/**
 * Return a redacted URL safe for build logs: origin + pathname only.
 * Strips query strings, fragments, and userinfo that may contain tokens
 * or signed-URL credentials.
 *
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
  console.log('\u2705 dataset already present, skipping download (use --force to refresh)');
  process.exit(0);
}

console.log(`\u2699\ufe0f  downloading ${redactUrl(SOURCE_URL)}`);

let body;
try {
  const { body: downloadedBody, contentType } = await fetchWithRetry(SOURCE_URL);

  // Warn on unexpected Content-Type (GitHub raw sometimes returns
  // application/octet-stream, so this is non-fatal).
  if (
    contentType &&
    !contentType.includes('text/') &&
    !contentType.includes('application/octet-stream')
  ) {
    console.warn(
      `\u26a0\ufe0f  unexpected Content-Type: ${contentType} (expected text/csv or text/plain)`,
    );
  }

  body = downloadedBody;
} catch (err) {
  const detail =
    err.name === 'TimeoutError' ? 'timeout after 30s' : err.message;
  console.error(`\u274c download failed after 3 attempts: ${detail}`);
  process.exit(1);
}

try {
  validateCsvContent(body);
} catch (err) {
  console.error(`\u274c downloaded file is not valid CSV: ${err.message}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Integrity verification (#222)                                       */
/* ------------------------------------------------------------------ */

/**
 * Print a structural summary of the auto-trusted CSV content (#317).
 *
 * Gives developers visual confirmation of what was just auto-trusted,
 * so they can spot obvious anomalies (wrong dataset, unexpected row
 * counts, out-of-range coordinates) without opening the file.
 *
 * Non-blocking: if summarization fails, auto-bootstrap proceeds
 * normally with just the hash.
 *
 * @param {string} csvBody - The raw CSV content
 */
const printDataPreview = (csvBody) => {
  const summary = summarizeCsvForReview(csvBody);
  if (!summary) return;

  const { totalRows, sampleSchools, coordinateBounds } = summary;

  const parts = [`Rows: ${totalRows.toLocaleString()}`];
  if (coordinateBounds) {
    const { latMin, latMax, lonMin, lonMax } = coordinateBounds;
    parts.push(
      `Coords: lat ${latMin.toFixed(2)}\u2013${latMax.toFixed(2)}, ` +
        `lon ${lonMin.toFixed(2)}\u2013${lonMax.toFixed(2)}`,
    );
  }

  console.log(`\ud83d\udccb Auto-trusted data preview:`);
  console.log(`   ${parts.join(' | ')}`);
  for (let i = 0; i < sampleSchools.length; i++) {
    const { name, county } = sampleSchools[i];
    const suffix = county ? ` (${county})` : '';
    console.log(`   [${i + 1}] ${name}${suffix}`);
  }
  console.log(
    '   \u2500\u2500\u2500 Verify this looks correct. If suspicious, delete data-integrity.json and investigate.',
  );
};

/**
 * Auto-bootstrap the integrity hash for local development (#229).
 *
 * When integrity metadata is unavailable (empty hash, missing file, or
 * corrupt JSON), CI always fails closed.  Outside CI the developer
 * experience takes priority: compute the hash from the just-validated
 * CSV and persist it so subsequent runs verify normally.
 *
 * Prints a structural data preview so the developer can visually verify
 * what was auto-trusted (#317).
 *
 * @param {string} reason - human-readable explanation for the warning
 */
const autoBootstrap = async (reason) => {
  console.warn(
    `\u26a0\ufe0f  ${reason} \u2014 auto-bootstrapping for local development.\n` +
    '   Commit a verified hash with --update-integrity for production use.',
  );
  printDataPreview(body);
  const hash = verifyCsvIntegrity(body);
  await writeFile(integrityPath, JSON.stringify({ sha256: hash }, null, 2) + '\n', 'utf-8');
  console.log(`\u2705 data-integrity.json bootstrapped (sha256: ${hash})`);
};

if (updateIntegrity) {
  // Compute and persist the hash for the just-validated CSV.
  const hash = verifyCsvIntegrity(body);
  await writeFile(integrityPath, JSON.stringify({ sha256: hash }, null, 2) + '\n', 'utf-8');
  console.log(`\u2705 data-integrity.json updated (sha256: ${hash})`);
} else if (!skipIntegrity) {
  // Verify against the stored hash — fail-closed by default (#227).
  // Missing, empty, or unreadable integrity metadata aborts the build
  // in CI; outside CI it auto-bootstraps for developer convenience (#229).
  // Use --skip-integrity to opt out during local development.
  let needsBootstrap = false;
  let bootstrapReason = '';

  try {
    const raw = await readFile(integrityPath, 'utf-8');
    const { sha256: expectedHash } = JSON.parse(raw);

    if (!expectedHash) {
      if (process.env.CI) {
        console.error(
          '\u274c data-integrity.json sha256 is empty. Run with --update-integrity after verifying the upstream data, or use --skip-integrity for local development.',
        );
        process.exit(1);
      }
      needsBootstrap = true;
      bootstrapReason = 'data-integrity.json sha256 is empty';
    } else {
      verifyCsvIntegrity(body, expectedHash);
      console.log('\u2705 CSV integrity verified (sha256 match)');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (process.env.CI) {
        console.error(
          '\u274c data-integrity.json not found. Run with --update-integrity to create it, or use --skip-integrity for local development.',
        );
        process.exit(1);
      }
      needsBootstrap = true;
      bootstrapReason = 'data-integrity.json not found';
    } else if (err.message.includes('integrity check failed')) {
      // Real integrity mismatch: always fail-closed, all environments.
      console.error(`\u274c ${err.message}`);
      process.exit(1);
    } else {
      // Malformed JSON, unexpected read error, etc.
      if (process.env.CI) {
        console.error(`\u274c could not read data-integrity.json: ${err.message}. Use --skip-integrity to bypass.`);
        process.exit(1);
      }
      needsBootstrap = true;
      bootstrapReason = `could not read data-integrity.json (${err.message})`;
    }
  }

  if (needsBootstrap) {
    await autoBootstrap(bootstrapReason);
  }
}

// Write to a temporary file first, then atomically rename to the target.
// rename() on the same filesystem is a POSIX atomic operation, so the target
// is always either the complete old file or the complete new file — never a
// partial write that would fool the exists() check on the next run.
const tmpTarget = `${target}.tmp`;
await mkdir(dirname(target), { recursive: true });
try {
  await writeFile(tmpTarget, body, 'utf-8');
  await rename(tmpTarget, target);
} catch (err) {
  // Clean up partial temp file so it does not confuse the next run.
  try {
    await unlink(tmpTarget);
  } catch {
    /* ENOENT is expected if writeFile() itself failed */
  }
  throw err;
}
console.log(`\u2705 saved to ${target}`);
