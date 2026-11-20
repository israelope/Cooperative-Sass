/**
 * Unwrap a Supabase response, surfacing failures to the nearest error boundary
 * instead of silently rendering zeros and empty tables.
 *
 *   const stats = must(await supabase.rpc('admin_stats'), 'admin stats');
 */
export function must(result, context = 'load data') {
  if (result?.error) {
    const detail = result.error.message || result.error.hint || 'Unknown database error';
    throw new Error(`${context}: ${detail}`);
  }
  return result?.data;
}
