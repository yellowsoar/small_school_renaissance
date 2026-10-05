import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { verifyIntegrity } from './fetch-utils.js';

import {
  IntegrityError,
  redactUrl,
  fileExists,
  atomicWriteFile,
  runIntegrityFlow,
} from './integrity-utils.js';

vi.mock('node:fs/promises');
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-0000'),
}));
vi.mock('node:readline');
vi.mock('./fetch-utils.js');

/* ================================================================== */
/*  IntegrityError                                                      */
/* ================================================================== */

describe('IntegrityError', () => {
  it('defaults exitCode to 1', () => {
    const err = new IntegrityError('boom');
    expect(err.exitCode).toBe(1);
    expect(err.message).toBe('boom');
  });

  it('accepts a custom exitCode', () => {
    const err = new IntegrityError('boom', { exitCode: 42 });
    expect(err.exitCode).toBe(42);
  });

  it('sets name to "IntegrityError" and extends Error', () => {
    const err = new IntegrityError('boom');
    expect(err.name).toBe('IntegrityError');
    expect(err).toBeInstanceOf(Error);
  });
});

/* ================================================================== */
/*  redactUrl                                                           */
/* ================================================================== */

describe('redactUrl', () => {
  it('preserves origin + pathname for a normal URL', () => {
    expect(redactUrl('https://example.com/path/to/file')).toBe(
      'https://example.com/path/to/file',
    );
  });

  it('strips query string and fragment', () => {
    expect(redactUrl('https://example.com/data?token=secret#hash')).toBe(
      'https://example.com/data',
    );
  });

  it('returns "(invalid URL)" for non-URL input', () => {
    expect(redactUrl('not a url')).toBe('(invalid URL)');
  });
});

/* ================================================================== */
/*  fileExists                                                          */
/* ================================================================== */

describe('fileExists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when file exists and size > 0', async () => {
    stat.mockResolvedValue({ size: 42 });
    expect(await fileExists('/some/file')).toBe(true);
    expect(stat).toHaveBeenCalledWith('/some/file');
  });

  it('returns false when file does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    stat.mockRejectedValue(err);
    expect(await fileExists('/missing')).toBe(false);
  });

  it('returns false when file exists but size is 0', async () => {
    stat.mockResolvedValue({ size: 0 });
    expect(await fileExists('/empty')).toBe(false);
  });
});

/* ================================================================== */
/*  atomicWriteFile                                                     */
/* ================================================================== */

describe('atomicWriteFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    randomUUID.mockReturnValue('mock-uuid-0000');
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);
  });

  it('writes via tmp + rename on the happy path', async () => {
    await atomicWriteFile('/dir/target.json', '{"ok":true}');

    expect(mkdir).toHaveBeenCalledWith('/dir', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      '/dir/target.json.mock-uuid-0000.tmp',
      '{"ok":true}',
      'utf-8',
    );
    expect(rename).toHaveBeenCalledWith(
      '/dir/target.json.mock-uuid-0000.tmp',
      '/dir/target.json',
    );
  });

  it('creates nested parent directories with recursive: true', async () => {
    await atomicWriteFile('/a/b/c/d/file.json', 'data');
    expect(mkdir).toHaveBeenCalledWith('/a/b/c/d', { recursive: true });
  });

  it('cleans up tmp file when writeFile fails', async () => {
    writeFile.mockRejectedValue(new Error('disk full'));

    await expect(atomicWriteFile('/dir/t.json', 'x')).rejects.toThrow(
      'disk full',
    );

    expect(unlink).toHaveBeenCalledWith('/dir/t.json.mock-uuid-0000.tmp');
    expect(rename).not.toHaveBeenCalled();
  });

  it('cleans up tmp file when rename fails', async () => {
    rename.mockRejectedValue(new Error('EXDEV'));

    await expect(atomicWriteFile('/dir/t.json', 'x')).rejects.toThrow(
      'EXDEV',
    );

    expect(unlink).toHaveBeenCalledWith('/dir/t.json.mock-uuid-0000.tmp');
  });
});

/* ================================================================== */
/*  runIntegrityFlow                                                    */
/* ================================================================== */

describe('runIntegrityFlow', () => {
  const baseOpts = {
    body: 'csv-body-content',
    integrityPath: '/path/to/data-integrity.json',
    label: 'data',
    updateIntegrity: false,
    skipIntegrity: false,
    trustFirst: false,
  };

  let savedCI;
  let savedIsTTY;
  let savedStdinIsTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    savedCI = process.env.CI;
    savedIsTTY = process.stdout.isTTY;
    savedStdinIsTTY = process.stdin.isTTY;

    // Default environment: non-CI, non-TTY
    delete process.env.CI;
    process.stdout.isTTY = false;
    process.stdin.isTTY = false;

    verifyIntegrity.mockReturnValue('abc123');
    randomUUID.mockReturnValue('mock-uuid-0000');
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedCI === undefined) delete process.env.CI;
    else process.env.CI = savedCI;
    process.stdout.isTTY = savedIsTTY;
    process.stdin.isTTY = savedStdinIsTTY;
    vi.restoreAllMocks();
  });

  /* --update-integrity ------------------------------------------------ */

  it('computes hash and writes integrity file when updateIntegrity is set', async () => {
    verifyIntegrity.mockReturnValue('computed-hash-abc');

    await runIntegrityFlow({ ...baseOpts, updateIntegrity: true });

    expect(verifyIntegrity).toHaveBeenCalledWith('csv-body-content');
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      JSON.stringify({ sha256: 'computed-hash-abc' }, null, 2) + '\n',
      'utf-8',
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('updated'),
    );
  });

  /* --skip-integrity -------------------------------------------------- */

  it('returns immediately without I/O when skipIntegrity is set', async () => {
    await runIntegrityFlow({ ...baseOpts, skipIntegrity: true });

    expect(readFile).not.toHaveBeenCalled();
    expect(verifyIntegrity).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });

  /* default path: hash match ------------------------------------------ */

  it('verifies and logs success when stored hash matches', async () => {
    readFile.mockResolvedValue(JSON.stringify({ sha256: 'good-hash' }));
    verifyIntegrity.mockReturnValue('good-hash');

    await runIntegrityFlow(baseOpts);

    expect(readFile).toHaveBeenCalledWith(
      '/path/to/data-integrity.json',
      'utf-8',
    );
    expect(verifyIntegrity).toHaveBeenCalledWith('csv-body-content', 'good-hash');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('integrity verified'),
    );
  });

  /* hash mismatch: always fail-closed --------------------------------- */

  it('throws IntegrityError on hash mismatch regardless of environment', async () => {
    readFile.mockResolvedValue(JSON.stringify({ sha256: 'expected' }));
    verifyIntegrity.mockImplementation((_body, expected) => {
      if (expected) {
        throw new Error(
          'integrity check failed: expected sha256 expected, got actual',
        );
      }
      return 'actual';
    });

    const err = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(err).toBeInstanceOf(IntegrityError);
    expect(err.message).toContain('integrity check failed');
  });

  /* empty hash + CI --------------------------------------------------- */

  it('throws IntegrityError when sha256 is empty in CI', async () => {
    process.env.CI = 'true';
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const err = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(err).toBeInstanceOf(IntegrityError);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('sha256 is empty'),
    );
  });

  /* empty hash + non-CI + non-TTY: fail-closed (#450) ----------------- */

  it('throws IntegrityError when sha256 is empty in non-TTY non-CI (fail-closed)', async () => {
    process.stdout.isTTY = false;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const err = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(err).toBeInstanceOf(IntegrityError);
    expect(err.message).toContain('non-interactive environments');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('--trust-first to auto-trust in non-interactive environments'),
    );
  });

  /* empty hash + non-CI + trustFirst: auto-bootstrap ------------------ */

  it('auto-bootstraps when sha256 is empty with --trust-first', async () => {
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));
    verifyIntegrity.mockReturnValue('bootstrapped-hash');

    await runIntegrityFlow({ ...baseOpts, trustFirst: true });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('auto-bootstrapping'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bootstrapped'),
    );
  });

  /* ENOENT + CI ------------------------------------------------------- */

  it('throws IntegrityError when integrity file is missing in CI', async () => {
    process.env.CI = 'true';
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readFile.mockRejectedValue(err);

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
  });

  /* ENOENT + non-CI + non-TTY: fail-closed (#450) --------------------- */

  it('throws IntegrityError when integrity file is missing in non-TTY non-CI (fail-closed)', async () => {
    process.stdout.isTTY = false;
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readFile.mockRejectedValue(err);

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(caught.message).toContain('non-interactive environments');
  });

  /* ENOENT + non-CI + trustFirst: auto-bootstrap ---------------------- */

  it('auto-bootstraps when integrity file is missing with --trust-first', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readFile.mockRejectedValue(err);
    verifyIntegrity.mockReturnValue('fresh-hash');

    await runIntegrityFlow({ ...baseOpts, trustFirst: true });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bootstrapped'),
    );
  });

  /* malformed JSON + CI ----------------------------------------------- */

  it('throws IntegrityError when JSON is malformed in CI', async () => {
    process.env.CI = 'true';
    readFile.mockResolvedValue('{{invalid json');

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('could not read'),
    );
  });

  /* malformed JSON + non-CI + non-TTY: fail-closed (#450) ------------- */

  it('throws IntegrityError when JSON is malformed in non-TTY non-CI (fail-closed)', async () => {
    process.stdout.isTTY = false;
    readFile.mockResolvedValue('{{invalid json');

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(caught.message).toContain('non-interactive environments');
  });

  /* malformed JSON + non-CI + trustFirst: auto-bootstrap -------------- */

  it('auto-bootstraps when JSON is malformed with --trust-first', async () => {
    readFile.mockResolvedValue('{{invalid json');
    verifyIntegrity.mockReturnValue('recovered-hash');

    await runIntegrityFlow({ ...baseOpts, trustFirst: true });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('auto-bootstrapping'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bootstrapped'),
    );
  });

  /* previewFn callback ------------------------------------------------ */

  it('invokes previewFn with body before confirmation prompt', async () => {
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));
    verifyIntegrity.mockReturnValue('hash');
    const previewFn = vi.fn();

    await runIntegrityFlow({ ...baseOpts, trustFirst: true, previewFn });

    expect(previewFn).toHaveBeenCalledWith('csv-body-content');
    expect(previewFn).toHaveBeenCalledTimes(1);
  });

  /* non-TTY: no readline, fail-closed (#450) -------------------------- */

  it('does not create readline interface and throws in non-TTY mode', async () => {
    process.stdout.isTTY = false;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(createInterface).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(IntegrityError);
  });

  /* trustFirst bypasses TTY prompt ------------------------------------ */

  it('skips TTY prompt when trustFirst is true', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));
    verifyIntegrity.mockReturnValue('hash');

    await runIntegrityFlow({ ...baseOpts, trustFirst: true });

    expect(createInterface).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bootstrapped'),
    );
  });

  /* TTY user rejects -------------------------------------------------- */

  it('throws IntegrityError when TTY user declines auto-bootstrap', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const mockRl = {
      question: vi.fn((_prompt, cb) => cb('n')),
      close: vi.fn(),
      once: vi.fn(),
    };
    createInterface.mockReturnValue(mockRl);

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(caught.message).toContain('Aborted');
    expect(caught.message).toContain('bypass the prompt');
    expect(mockRl.question).toHaveBeenCalled();
    expect(mockRl.close).toHaveBeenCalled();
  });

  /* TTY rejection error message --------------------------------------- */

  it('shows TTY-specific hint when TTY user rejects', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const mockRl = {
      question: vi.fn((_prompt, cb) => cb('n')),
      close: vi.fn(),
      once: vi.fn(),
    };
    createInterface.mockReturnValue(mockRl);

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught.message).toContain('bypass the prompt');
    expect(caught.message).not.toContain('non-interactive environments');
  });

  /* stdout TTY but stdin not: fail-closed, no prompt (#483) ----------- */

  it('fails closed without prompting when stdout is a TTY but stdin is not (#483)', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = false;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(createInterface).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(IntegrityError);
    expect(caught.message).toContain('non-interactive environments');
    expect(caught.message).not.toContain('bypass the prompt');
  });

  /* stdin EOF before an answer: resolve "no" instead of hanging (#483) */

  it('treats stdin closing before an answer as a decline instead of hanging (#483)', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));

    // Simulate stdin EOF: readline emits 'close' and never invokes the
    // question callback.
    const mockRl = {
      question: vi.fn(),
      close: vi.fn(),
      once: vi.fn((event, handler) => {
        if (event === 'close') queueMicrotask(handler);
      }),
    };
    createInterface.mockReturnValue(mockRl);

    const caught = await runIntegrityFlow(baseOpts).catch((e) => e);

    expect(caught).toBeInstanceOf(IntegrityError);
    expect(caught.message).toContain('Aborted');
    expect(mockRl.question).toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  /* "y" answer still wins when rl.close() emits 'close' (#483) -------- */

  it('honours a "y" answer even though rl.close() emits close (#483)', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    readFile.mockResolvedValue(JSON.stringify({ sha256: '' }));
    verifyIntegrity.mockReturnValue('tty-hash');

    let onClose;
    const mockRl = {
      once: vi.fn((event, handler) => {
        if (event === 'close') onClose = handler;
      }),
      close: vi.fn(() => onClose?.()),
      question: vi.fn((_prompt, cb) => cb('y')),
    };
    createInterface.mockReturnValue(mockRl);

    await runIntegrityFlow(baseOpts);

    expect(mockRl.close).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bootstrapped'),
    );
  });
});
