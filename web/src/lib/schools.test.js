import { describe, expect, it } from 'vitest';
import { PROJECTION_YEARS } from '../config/index.js';
import { filterSchools, parseSchools, summarize, tierFor } from './schools.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const PROJECTION_COLUMNS = PROJECTION_YEARS.map((year) => `推估${year}年人數`);

const COLUMNS = [
  '學校代碼',
  '學校名稱',
  '縣市名稱',
  '鄉鎮市區',
  '地址',
  '電話',
  '網址',
  '地區屬性',
  '經度',
  '緯度',
  '學生人數',
  '參考學生人數',
  '學生人數差異',
  '學生人數變化百分比',
  ...PROJECTION_COLUMNS,
];

/**
 * Builds one CSV row. `projected` fills every 推估 column with the same value,
 * so tests only spell out the columns they actually care about.
 */
const row = ({ projected, ...overrides } = {}) => ({
  學校代碼: '014630',
  學校名稱: '市立插角國小',
  縣市名稱: '新北市',
  鄉鎮市區: '三峽區',
  地址: '[237]新北市三峽區插角里插角路39號',
  電話: '(02)26720230',
  網址: 'https://www.cgps.ntpc.edu.tw',
  地區屬性: '偏遠',
  經度: '121.40522708',
  緯度: '24.87235152',
  學生人數: '160',
  參考學生人數: '171',
  學生人數差異: '-11',
  學生人數變化百分比: '-0.06432748538011696',
  ...Object.fromEntries(
    PROJECTION_COLUMNS.map((column) => [column, projected == null ? '' : `${projected}`]),
  ),
  ...overrides,
});

const csv = (rows) =>
  [
    COLUMNS.join(','),
    ...rows.map((entry) => COLUMNS.map((column) => entry[column] ?? '').join(',')),
  ].join('\n');

/** Shorthand for the object shape filterSchools expects. */
const query = (overrides = {}) => ({
  year: 130,
  counties: new Set(),
  tiers: new Set(),
  search: '',
  ...overrides,
});

// ---------------------------------------------------------------------------
// tierFor
// ---------------------------------------------------------------------------

describe('tierFor', () => {
  it('returns null when there is no projection', () => {
    expect(tierFor(null)).toBeNull();
    expect(tierFor(undefined)).toBeNull();
  });

  it.each([
    [0, 'closed'],
    [1, 'critical'],
    [30, 'critical'],
    [31, 'high'],
    [50, 'high'],
    [51, 'watch'],
    [100, 'watch'],
    [101, 'stable'],
    [5000, 'stable'],
  ])('maps %i students to the %s tier', (headcount, id) => {
    expect(tierFor(headcount).id).toBe(id);
  });

  it('treats tier ceilings as inclusive', () => {
    expect(tierFor(30).id).not.toBe(tierFor(30.0001).id);
  });

  it('buckets a negative projection as closed rather than dropping it', () => {
    expect(tierFor(-12).id).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// parseSchools
// ---------------------------------------------------------------------------

describe('parseSchools', () => {
  it('normalizes a row into the shape the UI consumes', () => {
    const { schools } = parseSchools(csv([row({ projected: 126 })]));

    expect(schools).toHaveLength(1);
    expect(schools[0]).toMatchObject({
      id: '014630',
      name: '市立插角國小',
      county: '新北市',
      town: '三峽區',
      remoteness: '偏遠',
      enrollment: 160,
      reference: 171,
      delta: -11,
      unprojected: false,
    });
    expect(schools[0].position).toEqual([24.87235152, 121.40522708]);
    expect(schools[0].deltaRatio).toBeCloseTo(-0.0643, 4);
  });

  it('exposes every projection year as a numeric map', () => {
    const { schools } = parseSchools(csv([row({ projected: 42 })]));
    const { projections } = schools[0];

    expect([...projections.keys()]).toEqual(PROJECTION_YEARS);
    expect(projections.get(114)).toBe(42);
    expect(projections.get(130)).toBe(42);
    expect(projections.get(999)).toBeUndefined();
  });

  it('drops rows that cannot be placed on the map', () => {
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'keep' }),
        row({ projected: 10, 學校代碼: 'no-lat', 緯度: '' }),
        row({ projected: 10, 學校代碼: 'no-lng', 經度: '' }),
        row({ projected: 10, 學校代碼: 'junk-coords', 緯度: 'N/A', 經度: 'N/A' }),
      ]),
    );

    expect(schools.map((school) => school.id)).toEqual(['keep']);
  });

  it('flags rows with no projections at all', () => {
    const { schools } = parseSchools(csv([row({ projected: null })]));

    expect(schools[0].unprojected).toBe(true);
    expect(schools[0].projections.get(130)).toBeNull();
  });

  it('turns blank optional fields into null instead of empty strings', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 地址: '', 網址: '', 電話: '   ' })]),
    );

    expect(schools[0].address).toBeNull();
    expect(schools[0].website).toBeNull();
    expect(schools[0].phone).toBeNull();
  });

  it('falls back to readable defaults for missing identity fields', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: '', 學校名稱: '', 縣市名稱: '', 地區屬性: '' })]),
    );

    expect(schools[0]).toMatchObject({
      id: '24.87235152,121.40522708',
      name: '未命名學校',
      county: '未知縣市',
      remoteness: '一般地區',
    });
  });

  it('returns unique counties, sorted for zh-Hant', () => {
    const { counties } = parseSchools(
      csv([
        row({ projected: 10, 縣市名稱: '臺東縣' }),
        row({ projected: 10, 縣市名稱: '新北市' }),
        row({ projected: 10, 縣市名稱: '臺東縣' }),
        row({ projected: 10, 縣市名稱: '南投縣' }),
      ]),
    );

    expect(counties).toHaveLength(3);
    expect(new Set(counties)).toEqual(new Set(['臺東縣', '新北市', '南投縣']));
    expect(counties).toEqual([...counties].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
  });

  it('handles an empty dataset without throwing', () => {
    expect(parseSchools(csv([]))).toEqual({ schools: [], counties: [] });
  });

  it('skips blank lines and trims padded headers', () => {
    const padded = csv([row({ projected: 10 })])
      .split('\n')
      .map((line, index) => (index === 0 ? line.replaceAll('經度', ' 經度 ') : line))
      .join('\n');

    const { schools } = parseSchools(`${padded}\n\n`);

    expect(schools).toHaveLength(1);
    expect(schools[0].position[1]).toBe(121.40522708);
  });

  it('respects quoted fields containing commas', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校名稱: '"市立插角國小, 分校"' })]),
    );

    expect(schools[0].name).toBe('市立插角國小, 分校');
  });
});

// ---------------------------------------------------------------------------
// filterSchools
// ---------------------------------------------------------------------------

describe('filterSchools', () => {
  const dataset = parseSchools(
    csv([
      row({ projected: 0, 學校代碼: 'a', 學校名稱: '市立大成國小', 縣市名稱: '新北市', 鄉鎮市區: '三峽區' }),
      row({ projected: 26, 學校代碼: 'b', 學校名稱: '市立建安國小', 縣市名稱: '新北市', 鄉鎮市區: '三峽區' }),
      row({ projected: 126, 學校代碼: 'c', 學校名稱: '市立插角國小', 縣市名稱: '南投縣', 鄉鎮市區: '仁愛鄉' }),
      row({ projected: null, 學校代碼: 'd', 學校名稱: '市立淡海國小', 縣市名稱: '臺東縣', 鄉鎮市區: '海端鄉' }),
    ]),
  ).schools;

  const ids = (filters) =>
    filterSchools(dataset, query(filters))
      .map((school) => school.id)
      .sort();

  it('returns everything when no filter is active', () => {
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by county', () => {
    expect(ids({ counties: new Set(['新北市']) })).toEqual(['a', 'b']);
  });

  it('treats multiple counties as OR', () => {
    expect(ids({ counties: new Set(['南投縣', '臺東縣']) })).toEqual(['c', 'd']);
  });

  it('filters by risk tier for the selected year', () => {
    expect(ids({ tiers: new Set(['closed']) })).toEqual(['a']);
    expect(ids({ tiers: new Set(['closed', 'critical']) })).toEqual(['a', 'b']);
  });

  it('excludes schools with no projection once a tier filter is on', () => {
    expect(ids()).toContain('d');
    expect(ids({ tiers: new Set(['stable']) })).toEqual(['c']);
  });

  it('searches across name, county and town', () => {
    expect(ids({ search: '插角' })).toEqual(['c']);
    expect(ids({ search: '三峽區' })).toEqual(['a', 'b']);
    expect(ids({ search: '臺東縣' })).toEqual(['d']);
  });

  it('ignores surrounding whitespace in the search term', () => {
    expect(ids({ search: '   建安   ' })).toEqual(['b']);
  });

  it('returns nothing when the search matches nothing', () => {
    expect(ids({ search: '不存在的學校' })).toEqual([]);
  });

  it('combines filters as AND', () => {
    expect(ids({ counties: new Set(['新北市']), tiers: new Set(['closed']) })).toEqual(['a']);
    expect(ids({ counties: new Set(['南投縣']), tiers: new Set(['closed']) })).toEqual([]);
  });

  it('re-tiers schools when the year changes', () => {
    const shifting = parseSchools(
      csv([
        row({
          學校代碼: 'shift',
          ...Object.fromEntries(
            PROJECTION_COLUMNS.map((column, index) => [column, `${200 - index * 15}`]),
          ),
        }),
      ]),
    ).schools;

    expect(filterSchools(shifting, query({ year: 114, tiers: new Set(['stable']) }))).toHaveLength(1);
    expect(filterSchools(shifting, query({ year: 130, tiers: new Set(['stable']) }))).toHaveLength(0);
    expect(filterSchools(shifting, query({ year: 130, tiers: new Set(['closed']) }))).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const before = [...dataset];
    filterSchools(dataset, query({ search: '插角' }));
    expect(dataset).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  const dataset = parseSchools(
    csv([
      row({ projected: 0, 學校代碼: 'a' }),
      row({ projected: 26, 學校代碼: 'b' }),
      row({ projected: 126, 學校代碼: 'c' }),
      row({ projected: null, 學校代碼: 'd' }),
    ]),
  ).schools;

  it('counts every school passed in, projection or not', () => {
    expect(summarize(dataset, 130).schools).toBe(4);
  });

  it('sums only the schools that have a projection', () => {
    expect(summarize(dataset, 130).students).toBe(152);
  });

  it('counts schools projected to hit zero', () => {
    expect(summarize(dataset, 130).closing).toBe(1);
  });

  it('counts at-risk as 50 or fewer, including the zeroed ones', () => {
    expect(summarize(dataset, 130).atRisk).toBe(2);
  });

  it('rounds the student total, since projections can be fractional', () => {
    const fractional = parseSchools(
      csv([row({ projected: 10.4, 學校代碼: 'x' }), row({ projected: 10.4, 學校代碼: 'y' })]),
    ).schools;

    expect(summarize(fractional, 130).students).toBe(21);
  });

  it('returns zeroes for an empty selection', () => {
    expect(summarize([], 130)).toEqual({ schools: 0, students: 0, closing: 0, atRisk: 0 });
  });

  it('reports zeroes for a year outside the projection range', () => {
    expect(summarize(dataset, 999)).toMatchObject({ schools: 4, students: 0, closing: 0 });
  });
});
