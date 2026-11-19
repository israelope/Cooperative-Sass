'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';

export async function setTenantStatus(prev, fd) {
  const { user } = await requirePlatformAdmin();
  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '');
  if (!['active', 'suspended'].includes(status)) return { error: 'Invalid status.' };

  const svc = createServiceClient();
  const { data, error } = await svc.from('tenants')
    .update({ status, suspended_at: status === 'suspended' ? new Date().toISOString() : null })
    .eq('id', id).select('id, name');
  if (error || !data?.length) return { error: 'Could not update this cooperative.' };

  await svc.from('audit_logs').insert({ tenant_id: id, actor_id: user.id, action: `platform.tenant_${status}`, details: { by: user.email } });
  revalidatePath('/platform', 'layout');
  return { ok: true, message: status === 'suspended' ? `${data[0].name} suspended. Its users are locked out immediately.` : `${data[0].name} reactivated.` };
}
