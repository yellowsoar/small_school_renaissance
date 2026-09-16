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
 * Usage: node scripts/fetch-data.js [--force]
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithRetry, validateCsvContent } from './fetch-utils.js';

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
const force = process.argv.includes('--force');

const exists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

if (!force && (await exists(target))) {
  console.log('\u2705 dataset already present, skipping download (use --force to refresh)');
  process.exit(0);
}

console.log(`\u2699\ufe0f  downloading ${SOURCE_URL}`);

try {
  const response = await fetchWithRetry(SOURCE_URL);

  // Warn on unexpected Content-Type (GitHub raw sometimes returns
  // application/octet-stream, so this is non-fatal).
  const contentType = response.headers.get('content-type') ?? '';
  if (
    contentType &&
    !contentType.includes('text/') &&
    !contentType.includes('application/octet-stream')
  ) {
    console.warn(
      `\u26a0\ufe0f  unexpected Content-Type: ${contentType} (expected text/csv or text/plain)`,
    );
  }

  const body = await response.text();
  validateCsvContent(body);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body, 'utf-8');
  console.log(`\u2705 saved to ${target}`);
} catch (err) {
  const detail =
    err.name === 'TimeoutError' ? 'timeout after 30s' : err.message;
  console.error(`\u274c download failed after 3 attempts: ${detail}`);
  process.exit(1);
}
