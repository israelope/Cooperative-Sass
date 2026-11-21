/**
 * Unwrap a Supabase response, surfacing failures to the nearest error boundary
 * instead of silently rendering zeros and empty tables.
 *
 *   const stats = must(await supabase.rpc('admin_stats'), 'admin stats');
 */
function unwrap(result, context) {
  if (result?.error) {
    const detail = result.error.message || result.error.hint || 'Unknown database error';
    throw new Error(`${context}: ${detail}`);
  }
  return result;
}

export function must(result, context = 'load data') {
  return unwrap(result, context)?.data;
}

/** For queries using `{ count: 'exact' }` with `.range()`; returns rows and total. */
export function mustWithCount(result, context = 'load data') {
  const response = unwrap(result, context);
  return { rows: response?.data || [], count: response?.count ?? 0 };
}
