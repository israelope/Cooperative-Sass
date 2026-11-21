import { describe, it, expect } from 'vitest';
import { pageOf, pageRange, clampPage } from '@/lib/pagination';

describe('pagination helpers', () => {
  it('accepts only positive integers', () => {
    expect(pageOf('3')).toBe(3);
    expect(pageOf('0')).toBe(1);
    expect(pageOf('-2')).toBe(1);
    expect(pageOf('abc')).toBe(1);
  });
  it('builds inclusive ranges', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3)).toEqual({ from: 50, to: 74 });
  });
  it('clamps a bookmarked page into the real page count', () => {
    expect(clampPage(9, 50)).toBe(2);
    expect(clampPage(0, 50)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });
});
