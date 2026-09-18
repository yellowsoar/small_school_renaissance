import { describe, expect, it } from 'vitest';
import { PROJECTION_YEARS } from '../config/index.js';
import { parseSchools } from './schools.js';

const PROJECTION_COLUMNS = PROJECTION_YEARS.map((year) => `推估${year}年人數`);

const COLUMNS = [
  '學校代碼', '學校名稱', '縣市名稱', '鄉鎮市區', '地址', '電話', '網址',
  '地區屬性', '經度', '緯度', '學生人數', '參考學生人數',
  '學生人數差異', '學生人數變化百分比', ...PROJECTION_COLUMNS,
];

/** Produces a CSV string with only the header row (no data rows). */
const headerOnlyCsv = () => COLUMNS.join(',');

describe('parseSchools empty data guard (#171)', () => {
  it('throws when CSV contains only a header row and no data', () => {
    expect(() => parseSchools(headerOnlyCsv())).toThrow('CSV 資料為空');
  });

  it('throws when CSV text is completely blank', () => {
    expect(() => parseSchools('')).toThrow('CSV 資料為空');
  });

  it('throws when CSV text is only whitespace and newlines', () => {
    expect(() => parseSchools('   \n  \n  ')).toThrow('CSV 資料為空');
  });
});
