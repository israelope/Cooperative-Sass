import './env.js';
import { createClient } from '@supabase/supabase-js';
import { PASSWORD } from './env.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serviceClient = () => createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

/** Signs in exactly like a real user (anon key + password) so RLS applies. */
export async function clientFor(email) {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}. Did you run "npm run seed"?`);
  return c;
}

/** True when the database refused the operation OR it silently affected nothing. */
export const blocked = ({ data, error }) => !!error || !data || (Array.isArray(data) && data.length === 0);
