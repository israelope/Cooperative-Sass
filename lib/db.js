/**
 * Unwrap a Supabase response, surfacing failures to the nearest error boundary
 * instead of silently rendering zeros and empty tables.
 *
 * Both helpers await their argument, so a query builder can be passed directly
 * or an already-awaited response — callers only need to await the helper.
 *
 *   const stats = await must(supabase.rpc('admin_stats'), 'admin stats');
 */
async function unwrap(result, context) {
  const response = await result;
  if (response?.error) {
    const detail = response.error.message || response.error.hint || 'Unknown database error';
    throw new Error(`${context}: ${detail}`);
  }
  return response;
}

export async function must(result, context = 'load data') {
  return (await unwrap(result, context))?.data;
}

/** For queries using `{ count: 'exact' }` with `.range()`; returns rows and total. */
export async function mustWithCount(result, context = 'load data') {
  const response = await unwrap(result, context);
  return { rows: response?.data || [], count: response?.count ?? 0 };
}
