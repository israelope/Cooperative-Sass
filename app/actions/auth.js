'use server';
import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { slugify, isReservedSlug } from '@/lib/slug';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { roleHome } from '@/lib/roles';

const str = (fd, k) => String(fd.get(k) ?? '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkCommon({ email, password, fullName }) {
  if (fullName.length < 3) return 'Enter your full name.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  if (password.length < 8) return 'Use a password of at least 8 characters.';
  return null;
}

/** Resolve the role's scoped home after a sign-in (profile is authoritative). */
async function homeFor(supabase, user, fallbackRole) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenants(slug)')
    .eq('id', user.id)
    .maybeSingle();
  return roleHome(profile?.role || fallbackRole, profile?.tenants?.slug);
}

function friendlyAuthError(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('already') || m.includes('registered') || m.includes('exists')) return 'That email address is already in use. Log in instead.';
  return 'Could not create the account. Please try again.';
}

export async function login(prev, fd) {
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email address and password.' };
  const ip = clientIp(await headers());
  if (!rateLimit(`login:ip:${ip}`, { max: 30, windowMs: 15 * 60 * 1000 })) {
    return { error: 'Too many login attempts from this network. Wait a few minutes and try again.' };
  }
  if (!rateLimit(`login:email:${email}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: 'Too many attempts for this account. Wait a few minutes and try again.' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Email or password is incorrect.' };
  const role = data.user.app_metadata?.role;
  redirect(await homeFor(supabase, data.user, role));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** Cooperative president registers a society: creates tenant + admin account in one flow. */
export async function registerCooperative(prev, fd) {
  const coopName = str(fd, 'coopName');
  const fullName = str(fd, 'fullName');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (coopName.length < 3) return { error: 'Enter the cooperative\'s name (at least 3 characters).' };
  const bad = checkCommon({ email, password, fullName });
  if (bad) return { error: bad };
  if (!rateLimit(`register:${clientIp(await headers())}`, { max: 5, windowMs: 60 * 60 * 1000 })) {
    return { error: 'Too many registrations from this network. Try again later.' };
  }

  const admin = createServiceClient();

  // unique slug for the cooperative's link
  let slug = slugify(coopName);
  if (isReservedSlug(slug)) slug += '-coop';
  const { data: existing } = await admin.from('tenants').select('slug').like('slug', `${slug}%`);
  const taken = new Set((existing || []).map((t) => t.slug));
  if (taken.has(slug)) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;

  const tenantId = crypto.randomUUID();
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { tenant_id: tenantId, role: 'admin' },
    user_metadata: { full_name: fullName },
  });
  if (userErr) return { error: friendlyAuthError(userErr) };

  const { error: tErr } = await admin.from('tenants').insert({ id: tenantId, name: coopName, slug });
  if (tErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'Could not create the cooperative. Please try again.' };
  }
  const { error: pErr } = await admin.from('profiles').insert({ id: created.user.id, tenant_id: tenantId, role: 'admin', full_name: fullName });
  if (pErr) {
    await admin.from('tenants').delete().eq('id', tenantId);
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'Could not finish setting up your workspace. Please try again.' };
  }

  const supabase = await createClient();
  const { data: signed, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
  if (sErr) redirect('/login');
  redirect(await homeFor(supabase, signed.user, 'admin'));
}

/** A member self-registers through the cooperative's link; staff must approve (status = pending). */
export async function joinCooperative(prev, fd) {
  const slug = str(fd, 'slug');
  const fullName = str(fd, 'fullName');
  const phone = str(fd, 'phone');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const bad = checkCommon({ email, password, fullName });
  if (bad) return { error: bad };
  if (!rateLimit(`join:${clientIp(await headers())}`, { max: 8, windowMs: 60 * 60 * 1000 })) {
    return { error: 'Too many sign-ups from this network. Try again later.' };
  }

  const admin = createServiceClient();
  const { data: tenant } = await admin.from('tenants').select('id, name, status').eq('slug', slug).maybeSingle();
  if (!tenant || tenant.status !== 'active') return { error: 'This cooperative is not accepting new members.' };

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { tenant_id: tenant.id, role: 'member' },
    user_metadata: { full_name: fullName },
  });
  if (userErr) return { error: friendlyAuthError(userErr) };

  const memberNo = 'SELF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const { error: pErr } = await admin.from('profiles').insert({ id: created.user.id, tenant_id: tenant.id, role: 'member', full_name: fullName });
  const { error: mErr } = pErr
    ? { error: pErr }
    : await admin.from('members').insert({ tenant_id: tenant.id, user_id: created.user.id, member_no: memberNo, full_name: fullName, phone, email, status: 'pending' });
  if (pErr || mErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'Could not complete your registration. Please try again.' };
  }

  const supabase = await createClient();
  const { data: signed } = await supabase.auth.signInWithPassword({ email, password });
  redirect(await homeFor(supabase, signed.user, 'member'));
}

/** Imported member activates the account with a one-time claim code. */
export async function claimAccount(prev, fd) {
  const ip = clientIp(await headers());
  if (!rateLimit(`claim:ip:${ip}`, { max: 12, windowMs: 15 * 60 * 1000 })) {
    return { error: 'Too many attempts. Wait a few minutes and try again.' };
  }

  const code = str(fd, 'code').toUpperCase().replace(/\s+/g, '');
  const normalised = code.includes('-') ? code : code.replace(/^(.{4})(.{4})$/, '$1-$2');
  // A code-specific bucket stops an attacker spreading guesses across IP addresses.
  if (!rateLimit(`claim:code:${normalised}`, { max: 6, windowMs: 15 * 60 * 1000 })) {
    return { error: 'Too many attempts with this claim code. Wait a few minutes and try again.' };
  }
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalised)) return { error: 'Enter the claim code exactly as given to you (for example K7P2-9QXA).' };
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };
  if (password !== confirm) return { error: 'The two passwords do not match.' };

  const admin = createServiceClient();

  // 1. Atomically reserve the code so it cannot be redeemed twice.
  const { data: reserved } = await admin.from('members')
    .update({ status: 'active', claimed_at: new Date().toISOString() })
    .eq('claim_code', normalised).eq('status', 'unclaimed')
    .select('id, tenant_id, full_name').maybeSingle();
  if (!reserved) return { error: 'This claim code is not valid or has already been used.' };

  const undo = () => admin.from('members').update({ status: 'unclaimed', claimed_at: null }).eq('id', reserved.id);

  // A suspended cooperative cannot activate new members. Release the code again.
  const { data: tenant } = await admin.from('tenants').select('status').eq('id', reserved.tenant_id).maybeSingle();
  if (tenant?.status !== 'active') {
    await undo();
    return { error: 'This cooperative is suspended. Ask your coordinator to contact support.' };
  }

  // 2. Create the login with the tenant + role in tamper-proof app_metadata.
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { tenant_id: reserved.tenant_id, role: 'member' },
    user_metadata: { full_name: reserved.full_name },
  });
  if (userErr) { await undo(); return { error: friendlyAuthError(userErr) }; }

  const { error: pErr } = await admin.from('profiles').insert({ id: created.user.id, tenant_id: reserved.tenant_id, role: 'member', full_name: reserved.full_name });
  // 3. Link the account and burn the code.
  const { error: mErr } = pErr ? { error: pErr } : await admin.from('members').update({ user_id: created.user.id, email, claim_code: null }).eq('id', reserved.id);
  if (pErr || mErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await undo();
    return { error: 'Could not activate your account. Please try again.' };
  }

  const supabase = await createClient();
  const { data: signed } = await supabase.auth.signInWithPassword({ email, password });
  redirect(await homeFor(supabase, signed.user, 'member'));
}
