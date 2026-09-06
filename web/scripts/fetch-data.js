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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Node >= 20.12 can read .env natively; missing file is not an error here.
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch {
  /* no .env — defaults below apply */
}

const DATA_OWNER = process.env.DATA_OWNER ?? 'g0v';
const DATA_REPO = process.env.DATA_REPO ?? 'small_school_renaissance';
const DATA_BRANCH = process.env.DATA_BRANCH ?? 'gh-pages';
const DATA_PATH = process.env.DATA_PATH ?? 'docs/113-107.csv';

const SOURCE_URL =
  process.env.DATA_SOURCE_URL ??
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
  console.log('✅ dataset already present, skipping download (use --force to refresh)');
  process.exit(0);
}

console.log(`⚙️  downloading ${SOURCE_URL}`);

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  console.error(`❌ download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, Buffer.from(await response.arrayBuffer()));

console.log(`✅ saved to ${target}`);
