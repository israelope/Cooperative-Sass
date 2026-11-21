/** Shared page-size and range helpers for the paginated list pages. */

export const PAGE_SIZE = 25;

/** Accept only positive integers from the URL; everything else is page 1. */
export function pageOf(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}

/** Inclusive range for a Supabase .range() call. */
export function pageRange(page, size = PAGE_SIZE) {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}
