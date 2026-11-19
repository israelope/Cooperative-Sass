import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * SERVER-ONLY client that BYPASSES RLS. Use it only for: webhook reconciliation,
 * account creation (registration / claim), and setting payout details.
 * tenant_id must always come from verified records, never from request input.
 */
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
