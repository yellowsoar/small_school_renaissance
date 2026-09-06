import Papa from 'papaparse';
import { PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';

const num = (value) => {
  const parsed = Number.parseFloat(value);
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
 */
const toSchool = (row) => {
  const lat = num(row['緯度']);
  const lng = num(row['經度']);
  if (lat == null || lng == null) return null;

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

  const schools = data.map(toSchool).filter(Boolean);
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
      const haystack = `${school.name}${school.county}${school.town}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
};

/** Headline numbers for the summary strip. */
export const summarize = (schools, year) => {
  const totals = { schools: schools.length, students: 0, closing: 0, atRisk: 0 };

  for (const school of schools) {
    const projected = school.projections.get(year);
    if (projected == null) continue;
    totals.students += projected;
    if (projected <= 0) totals.closing += 1;
    if (projected <= 50) totals.atRisk += 1;
  }

  totals.students = Math.round(totals.students);
  return totals;
};
