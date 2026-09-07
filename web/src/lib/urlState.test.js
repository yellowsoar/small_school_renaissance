import { describe, expect, it } from 'vitest';
import { PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';
import {
  DEFAULT_YEAR,
  defaultFilters,
  filtersFromSearch,
  pruneCounties,
  searchFromFilters,
} from './urlState.js';

const filters = (overrides = {}) => ({ ...defaultFilters(), ...overrides });

describe('defaultFilters', () => {
  it('matches what an empty query string parses to', () => {
    expect(defaultFilters()).toEqual(filtersFromSearch(''));
  });

  it('hands out fresh Sets, so callers cannot poison the defaults', () => {
    const first = defaultFilters();
    first.counties.add('南投縣');
    expect(defaultFilters().counties.size).toBe(0);
  });
});

describe('filtersFromSearch', () => {
  it('returns defaults for an empty query string', () => {
    expect(filtersFromSearch('')).toEqual(filters());
  });

  it('reads every supported parameter', () => {
    const parsed = filtersFromSearch('?year=120&county=南投縣,臺東縣&tier=closed,critical&q=插角');

    expect(parsed.year).toBe(120);
    expect(parsed.counties).toEqual(new Set(['南投縣', '臺東縣']));
    expect(parsed.tiers).toEqual(new Set(['closed', 'critical']));
    expect(parsed.search).toBe('插角');
  });

  it('falls back to the default year when it is out of range or unparseable', () => {
    for (const query of ['?year=999', '?year=100', '?year=abc', '?year=']) {
      expect(filtersFromSearch(query).year, query).toBe(DEFAULT_YEAR);
    }
  });

  it('accepts both ends of the projection range', () => {
    expect(filtersFromSearch(`?year=${PROJECTION_YEARS.at(0)}`).year).toBe(PROJECTION_YEARS.at(0));
    expect(filtersFromSearch(`?year=${PROJECTION_YEARS.at(-1)}`).year).toBe(PROJECTION_YEARS.at(-1));
  });

  it('drops tier ids that do not exist', () => {
    const parsed = filtersFromSearch('?tier=closed,not-a-tier');
    expect(parsed.tiers).toEqual(new Set(['closed']));
  });

  it('keeps county names as-is, since the dataset is not loaded yet', () => {
    const parsed = filtersFromSearch('?county=南投縣,火星');
    expect(parsed.counties).toEqual(new Set(['南投縣', '火星']));
  });

  it('ignores empty segments and surrounding whitespace', () => {
    expect(filtersFromSearch('?county=,,南投縣,').counties).toEqual(new Set(['南投縣']));
    expect(filtersFromSearch('?q=%20%20插角%20%20').search).toBe('插角');
  });
});

describe('pruneCounties', () => {
  it('drops counties the dataset does not contain', () => {
    const pruned = pruneCounties(filters({ counties: new Set(['南投縣', '火星']) }), new Set(['南投縣']));
    expect(pruned.counties).toEqual(new Set(['南投縣']));
  });

  it('returns the same object when nothing changed, so setState can bail out', () => {
    const original = filters({ counties: new Set(['南投縣']) });
    expect(pruneCounties(original, new Set(['南投縣', '臺東縣']))).toBe(original);
  });

  it('is a no-op before the dataset is known', () => {
    const original = filters({ counties: new Set(['火星']) });
    expect(pruneCounties(original, null)).toBe(original);
  });

  it('leaves the other filters untouched', () => {
    const original = filters({ year: 120, counties: new Set(['火星']), search: '插角' });
    const pruned = pruneCounties(original, new Set());
    expect(pruned).toMatchObject({ year: 120, search: '插角' });
    expect(pruned.counties.size).toBe(0);
  });
});

describe('searchFromFilters', () => {
  it('produces an empty string for pristine filters', () => {
    expect(searchFromFilters(filters())).toBe('');
  });

  it('omits the year when it is the default', () => {
    expect(searchFromFilters(filters({ year: DEFAULT_YEAR }))).toBe('');
    expect(searchFromFilters(filters({ year: 120 }))).toBe('?year=120');
  });

  it('is stable regardless of insertion order', () => {
    const a = searchFromFilters(filters({ counties: new Set(['臺東縣', '南投縣']) }));
    const b = searchFromFilters(filters({ counties: new Set(['南投縣', '臺東縣']) }));
    expect(a).toBe(b);
  });

  it('orders tiers by severity, not by when they were clicked', () => {
    const query = searchFromFilters(filters({ tiers: new Set(['stable', 'closed']) }));
    expect(decodeURIComponent(query)).toBe('?tier=closed,stable');
  });

  it('trims the search term and omits it when blank', () => {
    expect(searchFromFilters(filters({ search: '   ' }))).toBe('');
    expect(decodeURIComponent(searchFromFilters(filters({ search: ' 插角 ' })))).toBe('?q=插角');
  });
});

describe('round trip', () => {
  it('survives a full set of filters', () => {
    const original = filters({
      year: 118,
      counties: new Set(['南投縣', '臺東縣']),
      tiers: new Set(['closed', 'high']),
      search: '國小',
    });

    expect(filtersFromSearch(searchFromFilters(original))).toEqual(original);
  });

  it('survives every tier individually', () => {
    for (const tier of RISK_TIERS) {
      const original = filters({ tiers: new Set([tier.id]) });
      expect(filtersFromSearch(searchFromFilters(original)), tier.id).toEqual(original);
    }
  });

  it('survives a search term with a comma in it', () => {
    const original = filters({ search: '插角, 分校' });
    expect(filtersFromSearch(searchFromFilters(original))).toEqual(original);
  });
});
