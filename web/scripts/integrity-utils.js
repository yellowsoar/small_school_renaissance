/**
 * Shared TOFU (Trust On First Use) integrity-verification utilities.
 *
 * Extracted from fetch-data.js and fetch-boundaries.js to eliminate
 * ~100 lines of near-identical code (#397).  Both scripts now import
 * these helpers instead of maintaining their own copies.
 *
 * Covers:
 * - URL redaction for safe build-log output
 * - File-existence check (non-empty guard)
 * - Atomic file writes (tmp + rename)
 * - Full integrity flow: CI fail-closed guards, local auto-bootstrap
 *   with optional TTY confirmation (#383), --update-integrity,
 *   --skip-integrity, and --trust-first flag handling
 */
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';

import { verifyIntegrity } from './fetch-utils.js';

/**
 * Custom error class for integrity verification failures.
 *
 * Thrown instead of calling process.exit() so that:
 * - Vitest can catch and assert on error paths without being killed
 * - Consumer scripts can compose multiple integrity checks
 * - The shared module does not control the process lifecycle
 *
 * @property {number} exitCode - process exit code for the consumer
 *   script to forward (default: 1)
 */
export class IntegrityError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = 'IntegrityError';
    this.exitCode = exitCode;
  }
}

/**
 * Return a redacted URL safe for build logs: origin + pathname only.
 * Strips query strings, fragments, and userinfo that may contain tokens
 * or signed-URL credentials.
 *
 * @param {string} url
 * @returns {string}
 */
export function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(invalid URL)';
  }
}

/**
 * Check if a file exists and is non-empty.
 *
 * @param {string} path - absolute path to check
 * @returns {Promise<boolean>}
 */
export async function fileExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

/**
 * Atomically write content to a file using tmp + rename.
 *
 * rename() on the same filesystem is a POSIX atomic operation, so the
 * target is always either the complete old file or the complete new
 * file \u2014 never a partial write.
 *
 * @param {string} target - destination file path
 * @param {string} content - file content to write
 */
export async function atomicWriteFile(target, content) {
  const tmpTarget = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(tmpTarget, content, 'utf-8');
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
}

/**
 * Run the full TOFU integrity verification flow.
 *
 * Encapsulates the shared logic previously duplicated in fetch-data.js
 * and fetch-boundaries.js: CI fail-closed guards, local auto-bootstrap
 * with optional TTY confirmation, and hash verification.
 *
 * @param {object} opts
 * @param {string} opts.body - downloaded content to hash-verify
 * @param {string} opts.integrityPath - path to the integrity JSON file
 * @param {string} opts.label - human-readable label for log messages
 *   (e.g. 'data' or 'boundary')
 * @param {boolean} opts.updateIntegrity - --update-integrity flag
 * @param {boolean} opts.skipIntegrity - --skip-integrity flag
 * @param {boolean} opts.trustFirst - --trust-first flag
 * @param {Function} [opts.previewFn] - optional callback invoked with
 *   (body) before the TTY confirmation prompt; used by fetch-data.js
 *   to print a CSV structural preview (#317)
 */
export async function runIntegrityFlow({
  body,
  integrityPath,
  label,
  updateIntegrity,
  skipIntegrity,
  trustFirst,
  previewFn,
}) {
  /**
   * Prompt for explicit opt-in before auto-trusting downloaded data (#383).
   *
   * Returns true immediately when:
   * - --trust-first flag is set (explicit automation opt-in)
   * - stdout is not a TTY (non-interactive: Docker, piped scripts, etc.)
   *
   * In interactive TTY mode, asks the developer to confirm [y/N].
   *
   * @returns {Promise<boolean>}
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

  /**
   * Auto-bootstrap the integrity hash for local development (#229, #383).
   *
   * When integrity metadata is unavailable (empty hash, missing file, or
   * corrupt JSON), CI always fails closed.  Outside CI the developer
   * experience takes priority: show an optional data preview and ask for
   * explicit confirmation before persisting the hash.
   *
   * @param {string} reason - human-readable explanation for the warning
   */
  const autoBootstrap = async (reason) => {
    console.warn(
      `\u26a0\ufe0f  ${reason} \u2014 auto-bootstrapping for local development.\n` +
        '   Commit a verified hash with --update-integrity for production use.',
    );
    if (previewFn) previewFn(body);
    const trusted = await confirmTrust();
    if (!trusted) {
      console.error(
        '\u274c Aborted. Use --update-integrity after manual verification, ' +
          'or --trust-first to bypass the prompt.',
      );
      throw new IntegrityError(
        'Aborted. Use --update-integrity after manual verification, ' +
          'or --trust-first to bypass the prompt.',
      );
    }
    const hash = verifyIntegrity(body);
    await atomicWriteFile(
      integrityPath,
      JSON.stringify({ sha256: hash }, null, 2) + '\n',
    );
    console.log(`\u2705 ${label}-integrity.json bootstrapped (sha256: ${hash})`);
  };

  /* --update-integrity: compute and persist the hash */
  if (updateIntegrity) {
    const hash = verifyIntegrity(body);
    await atomicWriteFile(
      integrityPath,
      JSON.stringify({ sha256: hash }, null, 2) + '\n',
    );
    console.log(`\u2705 ${label}-integrity.json updated (sha256: ${hash})`);
    return;
  }

  /* --skip-integrity: opt out entirely */
  if (skipIntegrity) return;

  /* Default path: verify against stored hash */
  let needsBootstrap = false;
  let bootstrapReason = '';

  try {
    const raw = await readFile(integrityPath, 'utf-8');
    const { sha256: expectedHash } = JSON.parse(raw);

    if (!expectedHash) {
      if (process.env.CI) {
        console.error(
          `\u274c ${label}-integrity.json sha256 is empty. Run with --update-integrity after verifying the upstream data, or use --skip-integrity for local development.`,
        );
        throw new IntegrityError(
          `${label}-integrity.json sha256 is empty. Run with --update-integrity after verifying the upstream data, or use --skip-integrity for local development.`,
        );
      }
      needsBootstrap = true;
      bootstrapReason = `${label}-integrity.json sha256 is empty`;
    } else {
      verifyIntegrity(body, expectedHash);
      console.log(`\u2705 ${label} integrity verified (sha256 match)`);
    }
  } catch (err) {
    // Re-throw IntegrityError from the block above without wrapping.
    if (err instanceof IntegrityError) throw err;

    if (err.code === 'ENOENT') {
      if (process.env.CI) {
        console.error(
          `\u274c ${label}-integrity.json not found. Run with --update-integrity to create it, or use --skip-integrity for local development.`,
        );
        throw new IntegrityError(
          `${label}-integrity.json not found. Run with --update-integrity to create it, or use --skip-integrity for local development.`,
        );
      }
      needsBootstrap = true;
      bootstrapReason = `${label}-integrity.json not found`;
    } else if (err.message.includes('integrity check failed')) {
      // Real integrity mismatch: always fail-closed, all environments.
      console.error(`\u274c ${err.message}`);
      throw new IntegrityError(err.message);
    } else {
      // Malformed JSON, unexpected read error, etc.
      if (process.env.CI) {
        console.error(
          `\u274c could not read ${label}-integrity.json: ${err.message}. Use --skip-integrity to bypass.`,
        );
        throw new IntegrityError(
          `could not read ${label}-integrity.json: ${err.message}. Use --skip-integrity to bypass.`,
        );
      }
      needsBootstrap = true;
      bootstrapReason = `could not read ${label}-integrity.json (${err.message})`;
    }
  }

  if (needsBootstrap) {
    await autoBootstrap(bootstrapReason);
  }
}
