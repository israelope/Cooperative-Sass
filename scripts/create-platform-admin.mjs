// Creates the platform-owner (super admin) login. There is deliberately NO public sign-up for this role.
//   node scripts/create-platform-admin.mjs you@example.com "a-strong-password"
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './loadEnv.mjs';
import { upsertPlatformAdmin } from './platformAdmin.mjs';

loadEnv();
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: node scripts/create-platform-admin.mjs <email> "<password of at least 10 characters>"');
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  await upsertPlatformAdmin(admin, email, password);
  console.log(`Platform admin ready: ${email}\nLog in at /login. You will be taken to /platform.`);
} catch (e) {
  console.error('Failed:', e.message || e);
  process.exit(1);
}
