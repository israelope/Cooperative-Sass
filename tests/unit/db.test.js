import { describe, it, expect } from 'vitest';
import { must, mustWithCount } from '@/lib/db';

// A Supabase query builder is a thenable, not a resolved response. Passing one
// straight to must() previously returned undefined and silently broke pages.
const builder = (response) => ({ then: (resolve) => Promise.resolve(response).then(resolve) });

describe('must()', () => {
  it('unwraps a thenable query builder', async () => {
    await expect(must(builder({ data: { id: 1 }, error: null }))).resolves.toEqual({ id: 1 });
  });
  it('unwraps an already-awaited response', async () => {
    await expect(must({ data: [1, 2], error: null })).resolves.toEqual([1, 2]);
  });
  it('throws with the context when the response has an error', async () => {
    await expect(must(builder({ data: null, error: { message: 'boom' } }), 'tenant'))
      .rejects.toThrow('tenant: boom');
  });
});

describe('mustWithCount()', () => {
  it('returns rows and count from a thenable', async () => {
    await expect(mustWithCount(builder({ data: [{ id: 1 }], count: 42, error: null })))
      .resolves.toEqual({ rows: [{ id: 1 }], count: 42 });
  });
  it('defaults to empty rows and zero count', async () => {
    await expect(mustWithCount(builder({ data: null, count: null, error: null })))
      .resolves.toEqual({ rows: [], count: 0 });
  });
});
