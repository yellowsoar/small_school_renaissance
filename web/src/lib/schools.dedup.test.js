import { describe, expect, it } from 'vitest';
import { PROJECTION_YEARS } from '../config/index.js';
import { parseSchools } from './schools.js';

// Regression tests for #452: duplicate-ID disambiguation must produce new
// objects for duplicated schools and leave everything else untouched.

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

const row = (overrides = {}) => ({
  學校代碼: 'S001',
  學校名稱: '測試國小',
  縣市名稱: '新北市',
  鄉鎮市區: '三峽區',
  地址: '',
  電話: '',
  網址: '',
  地區屬性: '',
  經度: '121.4',
  緯度: '24.9',
  學生人數: '100',
  參考學生人數: '110',
  學生人數差異: '-10',
  學生人數變化百分比: '-0.09',
  ...Object.fromEntries(PROJECTION_COLUMNS.map((column) => [column, '50'])),
  ...overrides,
});

const csv = (rows) =>
  [
    COLUMNS.join(','),
    ...rows.map((entry) => COLUMNS.map((column) => entry[column] ?? '').join(',')),
  ].join('\n');

describe('parseSchools duplicate-ID disambiguation (#452)', () => {
  const dataset = () =>
    parseSchools(
      csv([
        row({ 學校代碼: 'UNIQUE', 學校名稱: '獨立校', 緯度: '24.5', 經度: '121.1' }),
        row({ 學校代碼: 'DUP', 學校名稱: '甲校', 緯度: '24.87', 經度: '121.41' }),
        row({ 學校代碼: 'DUP', 學校名稱: '乙校', 緯度: '25.05', 經度: '121.52' }),
        row({ 學校代碼: 'DUP', 學校名稱: '丙校', 緯度: '25.05', 經度: '121.52' }),
      ]),
    ).schools;

  it('keeps the original ID for schools without duplicates', () => {
    const unique = dataset().find((school) => school.name === '獨立校');
    expect(unique.id).toBe('UNIQUE');
  });

  it('suffixes duplicated IDs with coordinates and a counter', () => {
    const ids = dataset().map((school) => school.id);
    expect(ids).toEqual([
      'UNIQUE',
      'DUP::24.87,121.41',
      'DUP::25.05,121.52',
      'DUP::25.05,121.52#2',
    ]);
  });

  it('yields unique IDs and distinct objects for every school', () => {
    const schools = dataset();
    expect(new Set(schools.map((school) => school.id)).size).toBe(schools.length);
    expect(new Set(schools).size).toBe(schools.length);
  });

  it('preserves every other field on disambiguated copies', () => {
    const copy = dataset().find((school) => school.name === '乙校');
    expect(copy).toMatchObject({
      county: '新北市',
      enrollment: 100,
      position: [25.05, 121.52],
      unprojected: false,
    });
    expect(copy.projections.get(130)).toBe(50);
  });

  it('is deterministic across repeated parses', () => {
    const first = dataset().map((school) => school.id);
    const second = dataset().map((school) => school.id);
    expect(second).toEqual(first);
  });
});
