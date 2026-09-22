import { describe, expect, it, vi } from 'vitest';
import { PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';
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
  鄉鎮市區: '三峻區',
  地址: '[237]新北市三峻區插角里插角路39號',
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

// Workaround: the GitHub Content API double-escapes CJK characters
// adjacent to escaped double-quotes in JSON strings. Separating them
// with concatenation prevents the issue.
// prettier-ignore
const QUOTED_BRANCH_NAME = '"' + '市立插角國小, 分校' + '"';

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
      town: '三峻區',
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

  // --- unprojected flag semantic edge cases (regression tests for #300) -----

  it('sets unprojected=false when reference is null but projections exist (#300)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 42, 參考學生人數: '' })]),
    );

    expect(schools[0].reference).toBeNull();
    expect(schools[0].unprojected).toBe(false);
    expect(schools[0].projections.get(130)).toBe(42);
  });

  it('sets unprojected=true when reference exists but all projections are null (#300)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: null, 參考學生人數: '171' })]),
    );

    expect(schools[0].reference).toBe(171);
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

  // --- Duplicate ID disambiguation (regression tests for #45, #276) --------

  it('disambiguates duplicate fallback IDs when multiple schools share coordinates and lack a school code', () => {
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: '', 學校名稱: '甲校', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 20, 學校代碼: '', 學校名稱: '乙校', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 30, 學校代碼: '', 學校名稱: '丙校', 緯度: '24.9', 經度: '121.5' }),
      ]),
    );

    expect(schools).toHaveLength(3);
    expect(schools[0].id).toBe('24.9,121.5::24.9,121.5');
    expect(schools[1].id).toBe('24.9,121.5::24.9,121.5#2');
    expect(schools[2].id).toBe('24.9,121.5::24.9,121.5#3');
  });

  it('does not add a suffix when only one school uses a fallback ID', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: '', 學校名稱: '孤獨校' })]),
    );

    expect(schools[0].id).toBe('24.87235152,121.40522708');
    expect(schools[0].id).not.toContain('::');
  });

  it('disambiguates explicit duplicate school codes the same way', () => {
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'DUP001', 學校名稱: '甲校', 緯度: '24.87', 經度: '121.41' }),
        row({ projected: 20, 學校代碼: 'DUP001', 學校名稱: '乙校', 緯度: '25.05', 經度: '121.52' }),
      ]),
    );

    expect(schools[0].id).toBe('DUP001::24.87,121.41');
    expect(schools[1].id).toBe('DUP001::25.05,121.52');
  });

  it('produces the same IDs regardless of CSV row order (#276)', () => {
    const rowA = row({ projected: 10, 學校代碼: 'DUP001', 學校名稱: '甲校', 緯度: '24.87', 經度: '121.41' });
    const rowB = row({ projected: 20, 學校代碼: 'DUP001', 學校名稱: '乙校', 緯度: '25.05', 經度: '121.52' });

    const { schools: forward } = parseSchools(csv([rowA, rowB]));
    const { schools: reversed } = parseSchools(csv([rowB, rowA]));

    const forwardIds = new Set(forward.map((s) => s.id));
    const reversedIds = new Set(reversed.map((s) => s.id));

    expect(forwardIds).toEqual(reversedIds);
  });

  it('does not affect summarize() totals after disambiguation', () => {
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: '', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 20, 學校代碼: '', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 30, 學校代碼: '', 緯度: '24.9', 經度: '121.5' }),
      ]),
    );

    const totals = summarize(schools, 130);
    expect(totals.schools).toBe(3);
    expect(totals.students).toBe(60);
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

  // --- Empty data guard (regression tests for #171) -------------------------

  it('throws when CSV contains only a header row and no data (#171)', () => {
    expect(() => parseSchools(csv([]))).toThrow('CSV 資料為空');
  });

  it('throws when CSV text is completely blank (#171)', () => {
    expect(() => parseSchools('')).toThrow('CSV 資料為空');
  });

  it('throws on whitespace-only CSV text (#171)', () => {
    expect(() => parseSchools('   \n  \n  ')).toThrow('CSV 欄位不符');
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
      csv([row({ projected: 10, 學校名稱: QUOTED_BRANCH_NAME })]),
    );

    expect(schools[0].name).toBe('市立插角國小, 分校');
  });

  // --- CSV schema validation (regression tests for #16, #62) ---------------

  it('throws when required headers are missing', () => {
    const wrongHeaders = 'id,name,lat,lng\n1,test,24.0,121.0';

    expect(() => parseSchools(wrongHeaders)).toThrow('CSV 欄位不符');
    expect(() => parseSchools(wrongHeaders)).toThrow('學校代碼');
    expect(() => parseSchools(wrongHeaders)).toThrow('學校名稱');
    expect(() => parseSchools(wrongHeaders)).toThrow('縣市名稱');
    expect(() => parseSchools(wrongHeaders)).toThrow('緯度');
    expect(() => parseSchools(wrongHeaders)).toThrow('經度');
    expect(() => parseSchools(wrongHeaders)).toThrow('推估114年人數');
  });

  it('includes actual headers in the error message for debugging', () => {
    const wrongHeaders = 'id,name,lat,lng,extra\n1,test,24.0,121.0,x';

    try {
      parseSchools(wrongHeaders);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('id');
      expect(error.message).toContain('實際欄位');
    }
  });

  it('throws when CSV has data rows but all schools are unparseable', () => {
    const badData = csv([
      row({ projected: 10, 學校代碼: 'a', 緯度: '', 經度: '' }),
      row({ projected: 10, 學校代碼: 'b', 緯度: 'N/A', 經度: 'N/A' }),
    ]);

    expect(() => parseSchools(badData)).toThrow('無法解析出任何學校');
    expect(() => parseSchools(badData)).toThrow('2 筆資料');
  });

  it('only reports missing headers in the error, not present ones', () => {
    const partialHeaders = '緯度,經度,其他欄位\n24.0,121.0,test';

    try {
      parseSchools(partialHeaders);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('CSV 欄位不符');
      const missingLine = error.message.split('\n')[0];
      expect(missingLine).toContain('學校代碼');
      expect(missingLine).toContain('學校名稱');
      expect(missingLine).toContain('縣市名稱');
      expect(missingLine).toContain('推估114年人數');
      expect(missingLine).not.toContain('緯度');
      expect(missingLine).not.toContain('經度');
    }
  });

  it('truncates long header lists in the error with an ellipsis', () => {
    const manyHeaders = 'a,b,c,d,e,f,g\n1,2,3,4,5,6,7';

    try {
      parseSchools(manyHeaders);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('…');
      expect(error.message).not.toContain('f');
    }
  });

  // --- Projection sentinel regression test (#65) ---------------------------

  it('throws when projection columns are renamed but base headers are present (#65)', () => {
    const renamedHeaders = [
      ...COLUMNS.filter((col) => !col.startsWith('推估')),
      ...PROJECTION_YEARS.map((year) => `${year}年推估人數`),
    ];
    const headerLine = renamedHeaders.join(',');
    const dataLine = renamedHeaders.map(() => 'x').join(',');

    expect(() => parseSchools(`${headerLine}\n${dataLine}`)).toThrow('CSV 欄位不符');
    expect(() => parseSchools(`${headerLine}\n${dataLine}`)).toThrow('推估114年人數');
  });

  // --- County header regression test (#88) ---------------------------------

  it('throws when 縣市名稱 header is missing, preventing silent county fallback (#88)', () => {
    const headersWithoutCounty = COLUMNS.filter((col) => col !== '縣市名稱');
    const headerLine = headersWithoutCounty.join(',');
    const dataLine = headersWithoutCounty.map(() => 'x').join(',');

    expect(() => parseSchools(`${headerLine}\n${dataLine}`)).toThrow('CSV 欄位不符');
    expect(() => parseSchools(`${headerLine}\n${dataLine}`)).toThrow('縣市名稱');
  });

  // --- Bounding box validation (regression tests for #89) ------------------

  it('filters out coordinates at Null Island (0, 0)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'keep', 緯度: '24.87', 經度: '121.41' }),
        row({ projected: 10, 學校代碼: 'null-island', 緯度: '0', 經度: '0' }),
      ]),
    );

    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe('keep');
    const boundsWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('座標超出台灣範圍'),
    );
    expect(boundsWarns).toHaveLength(1);

    warnSpy.mockRestore();
  });

  it('filters out swapped lat/lng coordinates (lat=121, lng=24)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'keep', 緯度: '24.87', 經度: '121.41' }),
        row({ projected: 10, 學校代碼: 'swapped', 緯度: '121.41', 經度: '24.87' }),
      ]),
    );

    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe('keep');

    warnSpy.mockRestore();
  });

  it('filters out foreign coordinates outside Taiwan bounding box', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'keep', 緯度: '24.87', 經度: '121.41' }),
        row({ projected: 10, 學校代碼: 'tokyo', 緯度: '35.68', 經度: '139.69' }),
      ]),
    );

    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe('keep');

    warnSpy.mockRestore();
  });

  it('accepts coordinates at bounding box edges (Kinmen, southernmost island)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'kinmen', 學校名稱: '金門國小', 緯度: '24.45', 經度: '118.32' }),
        row({ projected: 10, 學校代碼: 'south', 學校名稱: '南端國小', 緯度: '21.95', 經度: '120.75' }),
      ]),
    );

    expect(schools).toHaveLength(2);
    const boundsWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('座標超出台灣範圍'),
    );
    expect(boundsWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('includes school name in the out-of-bounds warning message', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'valid', 緯度: '24.87', 經度: '121.41' }),
        row({ projected: 10, 學校代碼: 'oob', 學校名稱: '測試國小', 緯度: '0', 經度: '0' }),
      ]),
    );

    const boundsWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('座標超出台灣範圍'),
    );
    expect(boundsWarns).toHaveLength(1);
    expect(boundsWarns[0][0]).toContain('測試國小');

    warnSpy.mockRestore();
  });

  it('does not throw for valid headers even with some unparseable rows', () => {
    const mixed = csv([
      row({ projected: 10, 學校代碼: 'good' }),
      row({ projected: 10, 學校代碼: 'bad', 緯度: '', 經度: '' }),
    ]);

    const { schools } = parseSchools(mixed);
    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe('good');
  });

  // --- deltaRatio batch format detection (regression tests for #32) --------

  it('throws when majority of deltaRatio values exceed |1| (percentage format)', () => {
    const percentageFormat = csv([
      row({ projected: 10, 學校代碼: 'a', 學生人數變化百分比: '-5.2' }),
      row({ projected: 10, 學校代碼: 'b', 學生人數變化百分比: '-12.8' }),
      row({ projected: 10, 學校代碼: 'c', 學生人數變化百分比: '3.1' }),
      row({ projected: 10, 學校代碼: 'd', 學生人數變化百分比: '-0.5' }),
    ]);

    expect(() => parseSchools(percentageFormat)).toThrow('百分比數值');
    expect(() => parseSchools(percentageFormat)).toThrow('3/4');
  });

  it('warns but does not throw for a few outlier deltaRatio values above |1|', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fewOutliers = csv([
      row({ projected: 10, 學校代碼: 'a', 學生人數變化百分比: '-0.064' }),
      row({ projected: 10, 學校代碼: 'b', 學生人數變化百分比: '-0.15' }),
      row({ projected: 10, 學校代碼: 'c', 學生人數變化百分比: '1.5' }),
      row({ projected: 10, 學校代碼: 'd', 學生人數變化百分比: '-0.30' }),
    ]);

    const { schools } = parseSchools(fewOutliers);
    expect(schools).toHaveLength(4);
    const deltaWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('deltaRatio'),
    );
    expect(deltaWarns).toHaveLength(1);

    warnSpy.mockRestore();
  });

  it('stays silent when all deltaRatio values are within |1|', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const normalFormat = csv([
      row({ projected: 10, 學校代碼: 'a', 學生人數變化百分比: '-0.064' }),
      row({ projected: 10, 學校代碼: 'b', 學生人數變化百分比: '-0.15' }),
      row({ projected: 10, 學校代碼: 'c', 學生人數變化百分比: '0.02' }),
    ]);

    parseSchools(normalFormat);
    const deltaWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('deltaRatio'),
    );
    expect(deltaWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('excludes null deltaRatio values from the format check', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const withNulls = csv([
      row({ projected: 10, 學校代碼: 'a', 學生人數變化百分比: '-0.064' }),
      row({ projected: 10, 學校代碼: 'b', 學生人數變化百分比: '' }),
      row({ projected: 10, 學校代碼: 'c', 學生人數變化百分比: '' }),
      row({ projected: 10, 學校代碼: 'd', 學生人數變化百分比: '0.02' }),
    ]);

    const { schools } = parseSchools(withNulls);
    expect(schools).toHaveLength(4);
    const deltaWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('deltaRatio'),
    );
    expect(deltaWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('does not alter existing deltaRatio assertions for current data format', () => {
    const { schools } = parseSchools(csv([row({ projected: 126 })]));
    expect(schools[0].deltaRatio).toBeCloseTo(-0.0643, 4);
  });

  // --- Drop-ratio guard + warning (regression tests for #102, #172) --------

  it('throws when drop ratio exceeds 30% with >= 10 rows (#172)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 2 valid + 10 invalid = 12 rows, 83% drop rate
    const rows = [
      row({ projected: 10, 學校代碼: 'ok1' }),
      row({
        projected: 10,
        學校代碼: 'ok2',
        緯度: '24.9',
        經度: '121.5',
      }),
    ];
    for (let i = 0; i < 10; i++) {
      rows.push(
        row({
          projected: 10,
          學校代碼: `bad${i}`,
          緯度: '',
          經度: '',
        }),
      );
    }

    expect(() => parseSchools(csv(rows))).toThrow('資料品質異常');

    warnSpy.mockRestore();
  });

  it('does not throw for small datasets even with high drop ratio (#172)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 1 valid + 4 invalid = 5 rows, 80% drop but < 10 rows
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'valid' }),
        row({ projected: 10, 學校代碼: 'b1', 緯度: '', 經度: '' }),
        row({ projected: 10, 學校代碼: 'b2', 緯度: '', 經度: '' }),
        row({ projected: 10, 學校代碼: 'b3', 緯度: '', 經度: '' }),
        row({ projected: 10, 學校代碼: 'b4', 緯度: '', 經度: '' }),
      ]),
    );

    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe('valid');

    warnSpy.mockRestore();
  });

  it('includes drop count, percentage and threshold in the throw message (#172)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 2 valid + 8 invalid = 10 rows, 80% drop rate
    const rows = [
      row({ projected: 10, 學校代碼: 'ok1' }),
      row({
        projected: 10,
        學校代碼: 'ok2',
        緯度: '24.9',
        經度: '121.5',
      }),
    ];
    for (let i = 0; i < 8; i++) {
      rows.push(
        row({
          projected: 10,
          學校代碼: `bad${i}`,
          緯度: '',
          經度: '',
        }),
      );
    }

    expect(() => parseSchools(csv(rows))).toThrow('10 筆資料');
    expect(() => parseSchools(csv(rows))).toThrow('8 筆');
    expect(() => parseSchools(csv(rows))).toThrow('80.0%');
    expect(() => parseSchools(csv(rows))).toThrow('30%');

    warnSpy.mockRestore();
  });

  it('warns but does not throw when drop ratio is between 20% and 30% (#172)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3 valid + 1 invalid = 25% drop rate
    const { schools } = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'a' }),
        row({ projected: 10, 學校代碼: 'b', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 10, 學校代碼: 'c', 緯度: '24.8', 經度: '121.4' }),
        row({ projected: 10, 學校代碼: 'bad', 緯度: '', 經度: '' }),
      ]),
    );

    expect(schools).toHaveLength(3);
    const dropWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('parseSchools'),
    );
    expect(dropWarns).toHaveLength(1);
    expect(dropWarns[0][0]).toContain('25.0%');

    warnSpy.mockRestore();
  });

  it('does not throw at exactly 30% drop ratio (boundary, #172)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 7 valid + 3 invalid = 30% drop rate, >= 10 rows
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const lat = `${24.5 + i * 0.1}`;
      const lng = `${121.0 + i * 0.1}`;
      rows.push(
        row({
          projected: 10,
          學校代碼: `ok${i}`,
          緯度: lat,
          經度: lng,
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      rows.push(
        row({
          projected: 10,
          學校代碼: `bad${i}`,
          緯度: '',
          經度: '',
        }),
      );
    }

    const { schools } = parseSchools(csv(rows));
    expect(schools).toHaveLength(7);
    const dropWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('parseSchools'),
    );
    expect(dropWarns).toHaveLength(1);
    expect(dropWarns[0][0]).toContain('30.0%');

    warnSpy.mockRestore();
  });

  it('does not warn when drop ratio is at or below 20% (#102)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 4 valid + 1 invalid = 20% drop rate
    parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'a' }),
        row({ projected: 10, 學校代碼: 'b', 緯度: '24.9', 經度: '121.5' }),
        row({ projected: 10, 學校代碼: 'c', 緯度: '24.8', 經度: '121.4' }),
        row({ projected: 10, 學校代碼: 'd', 緯度: '25.0', 經度: '121.3' }),
        row({ projected: 10, 學校代碼: 'bad', 緯度: '', 經度: '' }),
      ]),
    );

    const dropWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('parseSchools'),
    );
    expect(dropWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  // --- Strict numeric parsing (regression tests for #113) ------------------

  it('rejects numeric fields with trailing non-numeric characters (#113)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: 'test', 學生人數: '123人' })]),
    );

    expect(schools[0].enrollment).toBeNull();
  });

  it('rejects percentage-suffixed values in numeric fields (#113)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: 'test', 學生人數變化百分比: '0.5%' })]),
    );

    expect(schools[0].deltaRatio).toBeNull();

    warnSpy.mockRestore();
  });

  it('rejects annotation-suffixed numeric fields (#113)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: 'test', 學生人數: '50(含分校)' })]),
    );

    expect(schools[0].enrollment).toBeNull();
  });

  it('parses pure numeric strings correctly with strict coercion (#113)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 126, 學校代碼: 'test' })]),
    );

    expect(schools[0].enrollment).toBe(160);
    expect(schools[0].reference).toBe(171);
    expect(schools[0].delta).toBe(-11);
    expect(schools[0].deltaRatio).toBeCloseTo(-0.0643, 4);
  });

  it('returns null for whitespace-only numeric fields (#113)', () => {
    const { schools } = parseSchools(
      csv([row({ projected: 10, 學校代碼: 'test', 學生人數: '   ' })]),
    );

    expect(schools[0].enrollment).toBeNull();
  });

  // --- Critical parse-error guard (regression tests for #208) ----------------

  it('throws when critical parse errors exceed 1% of data rows (#208)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3 valid rows + 1 row with too few fields = 4 data rows, 1 critical error
    // 1/4 = 25% > 1% threshold → throws
    const header = COLUMNS.join(',');
    const validRows = [
      row({ projected: 10, 學校代碼: 'a' }),
      row({ projected: 10, 學校代碼: 'b', 緯度: '24.9', 經度: '121.5' }),
      row({ projected: 10, 學校代碼: 'c', 緯度: '24.8', 經度: '121.4' }),
    ];
    const csvLines = [
      header,
      ...validRows.map((r) => COLUMNS.map((col) => r[col] ?? '').join(',')),
      'only,two,fields',
    ];

    expect(() => parseSchools(csvLines.join('\n'))).toThrow('欄位對齊錯誤過多');
    expect(() => parseSchools(csvLines.join('\n'))).toThrow('1/4');
    expect(() => parseSchools(csvLines.join('\n'))).toThrow('TooFewFields');
    expect(() => parseSchools(csvLines.join('\n'))).toThrow('1%');

    warnSpy.mockRestore();
  });

  it('does not throw when critical parse errors are at or below 1% (#208)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 100 valid rows + 1 broken row = 101 data rows, 1 critical error
    // 1/101 ≈ 0.99% which is NOT > 1% → does not throw
    // Broken row placed last so data[0] has all header keys for validation.
    const header = COLUMNS.join(',');
    const csvLines = [header];
    for (let i = 0; i < 100; i++) {
      const r = row({ projected: 10, 學校代碼: `s${i}` });
      csvLines.push(COLUMNS.map((col) => r[col] ?? '').join(','));
    }
    csvLines.push('only,two,fields');

    const { schools } = parseSchools(csvLines.join('\n'));
    expect(schools).toHaveLength(100);

    warnSpy.mockRestore();
  });

  it('still logs the existing console.warn for any PapaParse errors (#208)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3 valid + 1 broken = 4 rows, 25% critical → throws
    const header = COLUMNS.join(',');
    const validRows = [
      row({ projected: 10, 學校代碼: 'a' }),
      row({ projected: 10, 學校代碼: 'b', 緯度: '24.9', 經度: '121.5' }),
      row({ projected: 10, 學校代碼: 'c', 緯度: '24.8', 經度: '121.4' }),
    ];
    const csvLines = [
      header,
      ...validRows.map((r) => COLUMNS.map((col) => r[col] ?? '').join(',')),
      'only,two,fields',
    ];

    try {
      parseSchools(csvLines.join('\n'));
    } catch {
      /* expected */
    }

    // The existing console.warn for recoverable issues should still fire
    const recoverableWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('recoverable'),
    );
    expect(recoverableWarns).toHaveLength(1);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// filterSchools
// ---------------------------------------------------------------------------

describe('filterSchools', () => {
  const dataset = parseSchools(
    csv([
      row({ projected: 0, 學校代碼: 'a', 學校名稱: '市立大成國小', 縣市名稱: '新北市', 鄉鎮市區: '三峻區' }),
      row({ projected: 26, 學校代碼: 'b', 學校名稱: '市立建安國小', 縣市名稱: '新北市', 鄉鎮市區: '三峻區' }),
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
    expect(ids({ search: '三峻區' })).toEqual(['a', 'b']);
    expect(ids({ search: '臺東縣' })).toEqual(['d']);
  });

  it('ignores surrounding whitespace in the search term', () => {
    expect(ids({ search: '   建安   ' })).toEqual(['b']);
  });

  it('returns nothing when the search matches nothing', () => {
    expect(ids({ search: '不存在的學校' })).toEqual([]);
  });

  it('matches a search term that straddles two fields via concatenation (#281)', () => {
    expect(ids({ search: '插角國小南投縣' })).toEqual(['c']);
  });

  // --- Cross-field continuous input (regression tests for #281) ------------

  it('matches Chinese continuous county+town input without spaces (#281)', () => {
    expect(ids({ search: '南投縣仁愛鄉' })).toEqual(['c']);
  });

  it('matches cross-field input from URL query parameters (#281)', () => {
    expect(ids({ search: '新北市三峻區' })).toEqual(['a', 'b']);
  });

  // --- Multi-token AND search (regression tests for #90) -------------------

  it('matches when space-separated tokens hit different fields (#90)', () => {
    expect(ids({ search: '南投 國小' })).toEqual(['c']);
  });

  it('matches when space-separated tokens hit the same field', () => {
    expect(ids({ search: '三峻 建安' })).toEqual(['b']);
  });

  it('handles multiple consecutive spaces between tokens', () => {
    expect(ids({ search: '南投   國小' })).toEqual(['c']);
  });

  it('returns nothing when one token in a multi-token search has no match', () => {
    expect(ids({ search: '南投 不存在' })).toEqual([]);
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
    expect(summarize([], 130)).toEqual({ schools: 0, students: 0, closing: 0, atRisk: 0, unprojected: 0 });
  });

  it('reports zeroes for a year outside the projection range', () => {
    expect(summarize(dataset, 999)).toMatchObject({ schools: 4, students: 0, closing: 0 });
  });

  it('clamps negative projections to zero in the student total', () => {
    const withNegative = parseSchools(
      csv([
        row({ projected: -12, 學校代碼: 'neg' }),
        row({ projected: 100, 學校代碼: 'pos' }),
      ]),
    ).schools;

    const result = summarize(withNegative, 130);
    expect(result.students).toBe(100);
    expect(result.closing).toBe(1);
    expect(result.atRisk).toBe(1);
  });

  it('returns zero students when all projections are negative', () => {
    const allNegative = parseSchools(
      csv([
        row({ projected: -5, 學校代碼: 'x' }),
        row({ projected: -20, 學校代碼: 'y' }),
      ]),
    ).schools;

    const result = summarize(allNegative, 130);
    expect(result.students).toBe(0);
    expect(result.closing).toBe(2);
    expect(result.atRisk).toBe(2);
  });

  // --- Unprojected count (regression tests for #59) ------------------------

  it('counts schools with no projection as unprojected', () => {
    expect(summarize(dataset, 130).unprojected).toBe(1);
  });

  it('reports zero unprojected when all schools have projections', () => {
    const allProjected = parseSchools(
      csv([
        row({ projected: 10, 學校代碼: 'x' }),
        row({ projected: 20, 學校代碼: 'y' }),
      ]),
    ).schools;

    const result = summarize(allProjected, 130);
    expect(result.unprojected).toBe(0);
    expect(result.students).toBe(30);
  });

  // --- RISK_TIERS coupling (regression tests for #106) ----------------------

  it('closing and atRisk thresholds correspond to RISK_TIERS boundaries (#106)', () => {
    const closedMax = RISK_TIERS.find((t) => t.id === 'closed').max;
    const highMax = RISK_TIERS.find((t) => t.id === 'high').max;

    const atClosedBoundary = parseSchools(
      csv([row({ projected: closedMax, 學校代碼: 'at-closed' })]),
    ).schools;
    expect(summarize(atClosedBoundary, 130).closing).toBe(1);

    const aboveClosed = parseSchools(
      csv([row({ projected: closedMax + 1, 學校代碼: 'above-closed' })]),
    ).schools;
    expect(summarize(aboveClosed, 130).closing).toBe(0);

    const atHighBoundary = parseSchools(
      csv([row({ projected: highMax, 學校代碼: 'at-high' })]),
    ).schools;
    expect(summarize(atHighBoundary, 130).atRisk).toBe(1);

    const aboveHigh = parseSchools(
      csv([row({ projected: highMax + 1, 學校代碼: 'above-high' })]),
    ).schools;
    expect(summarize(aboveHigh, 130).atRisk).toBe(0);
  });
});
