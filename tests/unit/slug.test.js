import { describe, it, expect } from 'vitest';
import { slugify, isReservedSlug } from '@/lib/slug';
import { csvCell } from '@/lib/format';

describe('slugify', () => {
  it('makes a url-safe slug', () => expect(slugify("Adeola's Thrift & Credit Society!")).toBe('adeola-s-thrift-credit-society'));
  it('falls back when empty', () => expect(slugify('!!!')).toBe('cooperative'));
  it('flags reserved words', () => expect(isReservedSlug('admin')).toBe(true));
});

describe('csvCell', () => {
  it('quotes commas and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
  });
});
