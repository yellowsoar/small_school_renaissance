/**
 * Single source of truth for the CSV column names the application depends on.
 *
 * Both the build-time download validator (fetch-utils.js) and the browser-side
 * parser (schools.js) import this list, so a rename in the upstream dataset
 * triggers a single update here instead of a scattered hunt-and-sync.
 */
export const REQUIRED_HEADERS = ['學校代碼', '學校名稱', '緯度', '經度'];
