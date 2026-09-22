/**
 * Single source of truth for the CSV column names the application depends on.
 *
 * Both the build-time download validator (fetch-utils.js) and the browser-side
 * parser (schools.js) import this list, so a rename in the upstream dataset
 * triggers a single update here instead of a scattered hunt-and-sync.
 *
 * @see config/index.js for PROJECTION_YEARS (browser-only, uses import.meta.env)
 */

/**
 * The first projection year in the upstream CSV dataset (民國 year).
 * Used as a sentinel in REQUIRED_HEADERS to detect projection column renames.
 *
 * Defined here instead of importing from config/index.js because that module
 * uses import.meta.env (Vite-only), which Node build scripts cannot resolve.
 * config/index.js imports these constants to compute PROJECTION_YEARS.
 */
export const FIRST_PROJECTION_YEAR = 114;

/** The last projection year in the upstream CSV dataset (民國 year). */
export const LAST_PROJECTION_YEAR = 130;

/** Maximum allowed CSV response size in bytes (10 MB).
 *  The full dataset is ~2.5 MB; 10 MB provides a 4x safety margin
 *  while preventing memory exhaustion from corrupted or hijacked
 *  data sources (#207).
 *
 *  Single source of truth: both the browser-side fetchWithTimeout and
 *  the build-time fetchWithRetry import this constant (#283). */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

const BASE_HEADERS = [
  '學校代碼',
  '學校名稱',
  '縣市名稱',
  '緯度',
  '經度',
];

const PROJECTION_HEADERS = Array.from(
  { length: LAST_PROJECTION_YEAR - FIRST_PROJECTION_YEAR + 1 },
  (_, i) => `推估${FIRST_PROJECTION_YEAR + i}年人數`,
);

export const REQUIRED_HEADERS = [...BASE_HEADERS, ...PROJECTION_HEADERS];
