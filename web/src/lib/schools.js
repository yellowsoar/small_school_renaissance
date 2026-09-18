import Papa from 'papaparse';
import { PROJECTION_YEARS, RISK_TIERS, TW_BOUNDS } from '../config/index.js';
import { REQUIRED_HEADERS } from './csv-schema.js';

/**
 * Thresholds derived from RISK_TIERS so summarize() and the tier system
 * stay in sync when tier boundaries are adjusted (#106).
 */
const CLOSED_MAX = RISK_TIERS.find((t) => t.id === 'closed').max;
const AT_RISK_MAX = RISK_TIERS.find((t) => t.id === 'high').max;

const num = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Maps a projected headcount onto its risk tier. */
export const tierFor = (headcount) =>
  headcount == null ? null : RISK_TIERS.find(({ max }) => headcount <= max);

/**
 * Turns one raw CSV row into the shape the UI actually consumes.
 * Returns `null` for rows we cannot place on the map.
 *
 * `deltaRatio` is stored as a ratio (e.g. -0.0643 means -6.43%).
 * SchoolPopup formats it with `Intl.NumberFormat({ style: 'percent' })`,
 * which internally multiplies by 100 (ECMA-402 PartitionNumberPattern step 2).
 */
const toSchool = (row) => {
  const lat = num(row['緯度']);
  const lng = num(row['經度']);
  if (lat == null || lng == null) return null;

  // --- Bounding box validation (#89) ---------------------------------------
  if (
    lat < TW_BOUNDS.latMin || lat > TW_BOUNDS.latMax ||
    lng < TW_BOUNDS.lngMin || lng > TW_BOUNDS.lngMax
  ) {
    console.warn(
      `座標超出台灣範圍：${row['學校名稱'] ?? '未知'} (${lat}, ${lng})，已略過`,
    );
    return null;
  }

  const projections = new Map(
    PROJECTION_YEARS.map((year) => [year, num(row[`推估${year}年人數`])]),
  );

  return {
    id: text(row['學校代碼']) ?? `${lat},${lng}`,
    name: text(row['學校名稱']) ?? '未命名學校',
    county: text(row['縣市名稱']) ?? '未知縣市',
    town: text(row['鄉鎮市區']) ?? '—',
    address: text(row['地址']),
    phone: text(row['電話']),
    website: text(row['網址']),
    /** 教育部「地區屬性」: 偏遠 / 特偏 / 極偏, empty for general areas. */
    remoteness: text(row['地區屬性']) ?? '一般地區',
    position: [lat, lng],
    enrollment: num(row['學生人數']),
    reference: num(row['參考學生人數']),
    delta: num(row['學生人數差異']),
    deltaRatio: num(row['學生人數變化百分比']),
    projections,
    /** True when the trend could not be computed (no reference year data). */
    unprojected: [...projections.values()].every((value) => value == null),
  };
};

/** Parses the CSV text into a normalized, map-ready dataset. */
export const parseSchools = (csvText) => {
  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (errors.length > 0) {
    console.warn(`CSV parsed with ${errors.length} recoverable issue(s)`, errors[0]);
  }

  // --- Empty data guard (#171) ---------------------------------------------
  if (data.length === 0) {
    throw new Error('CSV 資料為空，請檢查上游資料來源');
  }

  // --- Header validation ---------------------------------------------------
  const headers = Object.keys(data[0]);
  const missing = REQUIRED_HEADERS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `CSV 欄位不符：缺少 ${missing.join('、')}\n` +
        `實際欄位：${headers.slice(0, 5).join('、')}${headers.length > 5 ? '…' : ''}`,
    );
  }

  const schools = data.map(toSchool).filter(Boolean);

  // --- Drop-ratio warning (#102) -------------------------------------------
  // When a significant portion of CSV rows are silently dropped (null
  // coordinates, out-of-bounds, etc.), warn so data maintainers notice
  // upstream quality issues before they affect policy decisions.
  if (data.length > 0) {
    const dropCount = data.length - schools.length;
    if (dropCount > 0) {
      const dropRatio = dropCount / data.length;
      if (dropRatio > 0.2) {
        console.warn(
          `parseSchools：${data.length} 筆資料中有 ${dropCount} 筆` +
            `（${(dropRatio * 100).toFixed(1)}%）因座標缺失或超出範圍被丟棄，` +
            `可能為上游資料格式異常`,
        );
      }
    }
  }

  // --- Duplicate ID disambiguation (#45) -----------------------------------
  // When multiple schools share the same fallback ID (e.g. same coordinates
  // with no school code), append #2, #3, … to subsequent duplicates so every
  // React key stays unique. The first occurrence keeps its original ID for
  // backward compatibility.
  const idCounts = new Map();
  for (const school of schools) {
    const count = (idCounts.get(school.id) ?? 0) + 1;
    idCounts.set(school.id, count);
    if (count > 1) {
      school.id = `${school.id}#${count}`;
    }
  }

  // --- Parse-result validation ---------------------------------------------
  if (schools.length === 0) {
    throw new Error(
      `CSV 包含 ${data.length} 筆資料但無法解析出任何學校，請檢查欄位格式`,
    );
  }

  // --- deltaRatio format detection (#32) -----------------------------------
  // The upstream CSV column「學生人數變化百分比」stores values as ratios
  // (e.g. -0.0643 = -6.43%). If upstream ever switches to percentage numbers
  // (e.g. -5.2 = -5.2%), Intl.NumberFormat({ style: 'percent' }) would
  // display -520% instead of -5.2%. Detect this at the batch level.
  const ratios = schools.map((s) => s.deltaRatio).filter((v) => v != null);
  if (ratios.length > 0) {
    const outliers = ratios.filter((v) => Math.abs(v) > 1);
    const outlierRatio = outliers.length / ratios.length;

    if (outlierRatio > 0.5) {
      throw new Error(
        `deltaRatio 格式異常：${outliers.length}/${ratios.length} 筆的絕對值超過 1，` +
          `疑似上游 CSV「學生人數變化百分比」已改為百分比數值格式（如 -5.2 代表 -5.2%）。` +
          `本系統預期比率格式（如 -0.052 代表 -5.2%），因 Intl.NumberFormat({ style: "percent" }) ` +
          `會內部乘以 100。請檢查上游資料格式。`,
      );
    }

    if (outliers.length > 0) {
      const sampleNames = schools
        .filter((s) => s.deltaRatio != null && Math.abs(s.deltaRatio) > 1)
        .slice(0, 3)
        .map((s) => s.name);
      console.warn(
        `deltaRatio 離群值：${outliers.length} 筆學校的 |deltaRatio| > 1` +
          `（${sampleNames.join('、')}），可能為合併或學區調整導致的大幅變化。`,
      );
    }
  }

  const counties = [...new Set(schools.map((school) => school.county))].sort((a, b) =>
    a.localeCompare(b, 'zh-Hant'),
  );

  return { schools, counties };
};

/** Applies the control-panel filters. Kept pure so it is trivially memoizable. */
export const filterSchools = (schools, { year, counties, tiers, search }) => {
  const needle = search.trim().toLowerCase();

  return schools.filter((school) => {
    if (counties.size > 0 && !counties.has(school.county)) return false;

    if (tiers.size > 0) {
      const tier = tierFor(school.projections.get(year));
      if (!tier || !tiers.has(tier.id)) return false;
    }

    if (needle) {
      // Split on whitespace for multi-token AND search (#90).
      // Each token must appear in at least one field (OR across fields).
      // Each field is tested on its own — concatenating them would let a
      // term straddle two fields ("插角國小南投縣" should not match).
      const tokens = needle.split(/\s+/).filter(Boolean);
      const fields = [school.name, school.county, school.town].map((f) =>
        f.toLowerCase(),
      );
      const allMatch = tokens.every((token) =>
        fields.some((field) => field.includes(token)),
      );
      if (!allMatch) return false;
    }

    return true;
  });
};

/** Headline numbers for the summary strip. */
export const summarize = (schools, year) => {
  const totals = { schools: schools.length, students: 0, closing: 0, atRisk: 0, unprojected: 0 };

  for (const school of schools) {
    const projected = school.projections.get(year);
    if (projected == null) { totals.unprojected += 1; continue; }
    totals.students += Math.max(0, projected);
    if (projected <= CLOSED_MAX) totals.closing += 1;
    if (projected <= AT_RISK_MAX) totals.atRisk += 1;
  }

  totals.students = Math.round(totals.students);
  return totals;
};
