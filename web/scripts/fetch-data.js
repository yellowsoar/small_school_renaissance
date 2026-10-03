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
 * Configuration lives in .env \u2014 see .env.example. Real environment variables
 * always take precedence over the file.
 *
 * Usage: node scripts/fetch-data.js [--force] [--update-integrity] [--skip-integrity] [--trust-first]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchWithRetry,
  formatDownloadError,
  validateCsvContent,
  summarizeCsvForReview,
} from './fetch-utils.js';
import { redactUrl, fileExists, atomicWriteFile, runIntegrityFlow, IntegrityError } from './integrity-utils.js';

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
const trustFirst = process.argv.includes('--trust-first');

if (!force && !updateIntegrity && (await fileExists(target))) {
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
  console.error(formatDownloadError(err, 'download'));
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

try {
  await runIntegrityFlow({
    body,
    integrityPath,
    label: 'data',
    updateIntegrity,
    skipIntegrity,
    trustFirst,
    previewFn: printDataPreview,
  });
} catch (err) {
  if (err instanceof IntegrityError) {
    process.exit(err.exitCode);
  }
  throw err;
}

await atomicWriteFile(target, body);
console.log(`\u2705 saved to ${target}`);
