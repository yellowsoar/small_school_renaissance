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

import { fetchWithRetry, validateCsvContent, verifyCsvIntegrity } from './fetch-utils.js';

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

if (updateIntegrity) {
  // Compute and persist the hash for the just-validated CSV.
  const hash = verifyCsvIntegrity(body);
  await writeFile(integrityPath, JSON.stringify({ sha256: hash }, null, 2) + '\n', 'utf-8');
  console.log(`\u2705 data-integrity.json updated (sha256: ${hash})`);
} else if (!skipIntegrity) {
  // Verify against the stored hash — fail-closed by default (#227).
  // Missing, empty, or unreadable integrity metadata aborts the build.
  // Use --skip-integrity to opt out during local development.
  try {
    const raw = await readFile(integrityPath, 'utf-8');
    const { sha256: expectedHash } = JSON.parse(raw);

    if (!expectedHash) {
      console.error(
        '\u274c data-integrity.json sha256 is empty. Run with --update-integrity after verifying the upstream data, or use --skip-integrity for local development.',
      );
      process.exit(1);
    }

    verifyCsvIntegrity(body, expectedHash);
    console.log('\u2705 CSV integrity verified (sha256 match)');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        '\u274c data-integrity.json not found. Run with --update-integrity to create it, or use --skip-integrity for local development.',
      );
      process.exit(1);
    } else if (err.message.includes('integrity check failed')) {
      console.error(`\u274c ${err.message}`);
      process.exit(1);
    } else {
      // Malformed JSON, unexpected read error, etc.
      console.error(`\u274c could not read data-integrity.json: ${err.message}. Use --skip-integrity to bypass.`);
      process.exit(1);
    }
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
