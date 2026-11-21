import { describe, it, expect } from 'vitest';
import { dedupeBanks } from '@/lib/banks';

describe('dedupeBanks', () => {
  it('keeps one option per bank code and drops empty codes', () => {
    expect(dedupeBanks([
      { name: 'Zenith Bank', code: '057' },
      { name: 'Zenith Bank Plc', code: '057' },
      { name: 'Access Bank', code: '044' },
      { name: 'No code', code: '' },
      null,
    ])).toEqual([
      { code: '057', name: 'Zenith Bank' },
      { code: '044', name: 'Access Bank' },
    ]);
  });
  it('handles a missing list', () => {
    expect(dedupeBanks(undefined)).toEqual([]);
  });
});
