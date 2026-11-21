'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createSubaccount, updateSubaccount } from '@/lib/paystack';
import { validateRows } from '@/lib/importValidate';
import { parseSpreadsheet } from '@/lib/importParse';

const str = (fd, k) => String(fd.get(k) ?? '').trim();
const num = (fd, k) => Number(String(fd.get(k) ?? '').replace(/,/g, ''));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const msg = (e) => String(e?.message || e || 'Something went wrong.');

/* ---------------- members ---------------- */

export async function addMember(prev, fd) {
  const { supabase } = await requireStaff();
  const phone = str(fd, 'phone');
  if (phone && !/^(\+234|234|0)[789][01]\d{8}$/.test(phone.replace(/\s/g, ''))) return { error: 'Enter a valid Nigerian mobile number or leave it empty.' };
  const savings = fd.get('openingSavings') ? num(fd, 'openingSavings') : 0;
  if (!(savings >= 0)) return { error: 'Opening savings must be zero or more.' };

  const { data: code, error } = await supabase.rpc('add_member', {
    p_member_no: str(fd, 'memberNo'), p_full_name: str(fd, 'fullName'),
    p_phone: phone, p_email: str(fd, 'email'), p_opening_savings: savings,
  });
  if (error) return { error: msg(error) };
  revalidatePath('/admin/members');
  return { ok: true, message: `Member added. Give them this claim code: ${code}` };
}

export async function setMemberStatus(prev, fd) {
  const { supabase } = await requireStaff();
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!['active', 'suspended'].includes(status)) return { error: 'Invalid status.' };
  const { data, error } = await supabase.from('members').update({ status }).eq('id', id).select('id');
  if (error || !data?.length) return { error: 'Could not update this member.' };
  await supabase.rpc('log_audit', { p_action: `member.${status}`, p_details: { member_id: id } });
  revalidatePath('/admin/members');
  return { ok: true, message: status === 'active' ? 'Member activated.' : 'Member suspended.' };
}

/* ---------------- manual payment ---------------- */

export async function recordManualPayment(prev, fd) {
  const { supabase } = await requireStaff();
  const amount = num(fd, 'amount');
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' };
  const receiptPath = str(fd, 'receiptPath');
  if (!receiptPath) return { error: 'Upload a photo of the receipt first.' };
  const { error } = await supabase.rpc('record_manual_payment', {
    p_member_id: str(fd, 'memberId'), p_amount: amount, p_channel: str(fd, 'channel'),
    p_receipt_path: receiptPath, p_paid_on: str(fd, 'paidOn') || null, p_note: str(fd, 'note') || null,
  });
  if (error) return { error: msg(error) };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Payment recorded and added to the member\'s passbook.' };
}

/* ---------------- bulk import ---------------- */

export async function importMembers(prev, fd) {
  const { supabase } = await requireStaff({ adminOnly: true });
  const mode = str(fd, 'mode'); // 'preview' | 'commit'
  const file = fd.get('file');
  if (!file || typeof file === 'string' || file.size === 0) return { error: 'Choose an Excel or CSV file first.' };
  if (file.size > 2.5 * 1024 * 1024) return { error: 'The file is too large (limit 2.5 MB).' };

  let rows;
  try {
    rows = parseSpreadsheet(await file.arrayBuffer());
  } catch (e) {
    return { error: msg(e) || 'Could not read the file.' };
  }
  const { valid, errors } = validateRows(rows);
  if (errors.length) return { error: 'Fix these rows and upload again. Nothing was imported.', errors: errors.slice(0, 50), moreErrors: Math.max(0, errors.length - 50) };

  if (mode !== 'commit') return { ok: true, preview: valid.slice(0, 200), total: valid.length, message: `${valid.length} rows are valid and ready to import.` };

  const cutoff = str(fd, 'cutoff') || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('import_members', { p_rows: valid, p_cutoff: cutoff });
  if (error) return { error: msg(error) };
  revalidatePath('/admin', 'layout');
  return { ok: true, imported: data, message: `${data.length} members imported. Share each claim code with its owner.` };
}

/* ---------------- loans ---------------- */

export async function decideLoan(prev, fd) {
  const { supabase } = await requireStaff({ adminOnly: true });
  // The decision is normally written by the clicked button in ActionForm. An Enter-key submit
  // in the interest field can bypass that, so fail closed instead of silently rejecting the loan.
  const decision = str(fd, 'decision');
  if (decision !== 'approve' && decision !== 'reject') return { error: 'Choose Approve or Reject.' };
  const approve = decision === 'approve';
  const { error } = await supabase.rpc('decide_loan', { p_loan_id: str(fd, 'loanId'), p_approve: approve, p_interest: approve ? num(fd, 'interest') : null });
  if (error) return { error: msg(error) };
  revalidatePath('/admin/loans');
  return { ok: true, message: approve ? 'Loan approved. Transfer the money, then mark it as paid out.' : 'Loan rejected.' };
}

export async function activateLoan(prev, fd) {
  const { supabase } = await requireStaff({ adminOnly: true });
  const { error } = await supabase.rpc('activate_loan', { p_loan_id: str(fd, 'loanId') });
  if (error) return { error: msg(error) };
  revalidatePath('/admin/loans');
  return { ok: true, message: 'Loan is now active.' };
}

export async function recordRepayment(prev, fd) {
  const { supabase } = await requireStaff();
  const amount = num(fd, 'amount');
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' };
  const { error } = await supabase.rpc('record_repayment', { p_loan_id: str(fd, 'loanId'), p_amount: amount });
  if (error) return { error: msg(error) };
  revalidatePath('/admin/loans');
  return { ok: true, message: 'Repayment recorded.' };
}

/* ---------------- settings ---------------- */

export async function saveSettings(prev, fd) {
  const { supabase, profile } = await requireStaff({ adminOnly: true });
  const name = str(fd, 'name');
  const multiplier = num(fd, 'loanMultiplier');
  const interest = num(fd, 'interest');
  if (name.length < 3) return { error: 'Enter the cooperative\'s name.' };
  if (!(multiplier >= 0 && multiplier <= 20)) return { error: 'Loan multiplier must be between 0 and 20.' };
  if (!(interest >= 0 && interest <= 100)) return { error: 'Interest rate must be between 0 and 100.' };
  const { data, error } = await supabase.from('tenants')
    .update({ name, loan_multiplier: multiplier, default_interest_rate: interest })
    .eq('id', profile.tenant_id).select('id');
  if (error || !data?.length) return { error: 'Could not save settings.' };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Settings saved.' };
}

/** Saves payout bank details and creates/updates the cooperative's Paystack sub-account (split settlement). */
export async function saveBank(prev, fd) {
  const { profile } = await requireStaff({ adminOnly: true });
  const bankCode = str(fd, 'bankCode');
  const bankName = str(fd, 'bankName');
  const accountNumber = str(fd, 'accountNumber');
  if (!bankCode) return { error: 'Choose your bank.' };
  if (!/^\d{10}$/.test(accountNumber)) return { error: 'Account number must be 10 digits.' };

  const admin = createServiceClient();
  const { data: tenant } = await admin.from('tenants').select('id, name, paystack_subaccount_code').eq('id', profile.tenant_id).single();
  try {
    const args = { businessName: tenant.name, bankCode, accountNumber };
    const sub = tenant.paystack_subaccount_code
      ? await updateSubaccount(tenant.paystack_subaccount_code, args)
      : await createSubaccount(args);
    const { error } = await admin.from('tenants').update({
      bank_code: bankCode, bank_name: bankName, account_number: accountNumber,
      paystack_subaccount_code: sub.subaccount_code || tenant.paystack_subaccount_code,
    }).eq('id', tenant.id);
    if (error) throw error;
  } catch (e) {
    return { error: `Paystack could not set up the payout account: ${e.message}` };
  }
  revalidatePath('/admin/settings');
  return { ok: true, message: 'Payout account saved. Members can now pay online and the money goes to this account.' };
}

export async function createStaff(prev, fd) {
  const { profile } = await requireStaff({ adminOnly: true });
  const role = str(fd, 'role');
  if (role !== 'admin' && role !== 'bookkeeper') return { error: 'Choose admin or bookkeeper.' };
  const fullName = str(fd, 'fullName');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (fullName.length < 3) return { error: `Enter the ${role}'s full name.` };
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };

  const admin = createServiceClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { tenant_id: profile.tenant_id, role },
    user_metadata: { full_name: fullName },
  });
  if (error) return { error: 'Could not create the account. The email may already be in use.' };
  const { error: pErr } = await admin.from('profiles').insert({ id: created.user.id, tenant_id: profile.tenant_id, role, full_name: fullName });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Could not create the ${role} profile.` };
  }
  const { error: auditErr } = await admin.from('audit_logs').insert({
    tenant_id: profile.tenant_id, actor_id: profile.id,
    action: 'staff.created', details: { user_id: created.user.id, role, email },
  });
  if (auditErr) {
    // Do not leave an unaudited privileged account behind.
    await admin.from('profiles').delete().eq('id', created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'Could not record this action in the audit log. No account was created; please try again.' };
  }
  revalidatePath('/admin/team');
  revalidatePath('/admin/settings');
  return { ok: true, message: `${role === 'admin' ? 'Admin' : 'Bookkeeper'} account created for ${email}. Share the password with them securely.` };
}

/** Kept for the Settings page; all staff roles now go through createStaff. */
export async function createBookkeeper(prev, fd) {
  const withRole = new FormData(fd);
  withRole.set('role', 'bookkeeper');
  return createStaff(prev, withRole);
}

/**
 * Changes a person's role inside the caller's cooperative. The SQL function
 * re-checks role, tenant, the last-admin rule and the member-record rule.
 * The JWT claim also has to be updated through the admin API, otherwise the
 * person keeps their old permissions until they sign in again.
 */
export async function setStaffRole(prev, fd) {
  const { supabase, profile } = await requireStaff({ adminOnly: true });
  const userId = str(fd, 'userId');
  const role = str(fd, 'role');
  if (!['admin', 'bookkeeper', 'member'].includes(role)) return { error: 'Invalid role.' };

  const { data: changed, error } = await supabase.rpc('set_staff_role', { p_user_id: userId, p_role: role });
  if (error) return { error: msg(error) };

  const admin = createServiceClient();
  const { data: found, error: readErr } = await admin.auth.admin.getUserById(userId);
  if (!readErr && found?.user) {
    const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...(found.user.app_metadata || {}), tenant_id: profile.tenant_id, role },
    });
    if (metaErr) return { error: 'Role saved, but the login metadata could not be refreshed. Ask them to sign out and back in.' };
  }

  revalidatePath('/admin/team');
  revalidatePath('/admin/settings');
  revalidatePath('/admin/members');
  revalidatePath('/admin', 'layout');
  return {
    ok: true,
    message: changed === 'unchanged' ? 'No change needed.' : `Role set to ${role}. Ask them to sign out and back in.`,
  };
}

/* ---------------- reconciliation exceptions ---------------- */

export async function resolveReconciliation(prev, fd) {
  const { supabase } = await requireStaff();
  const { data, error } = await supabase.rpc('resolve_reconciliation', {
    p_id: str(fd, 'id'), p_action: str(fd, 'action'), p_note: str(fd, 'note'),
  });
  if (error) return { error: msg(error) };
  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin', 'layout');
  return { ok: true, message: data === 'resolved' ? 'Decision recorded.' : String(data) };
}
