// Shared helper: create (or update) the platform-owner account.
export async function upsertPlatformAdmin(admin, email, password) {
  const attrs = { password, email_confirm: true, app_metadata: { role: 'platform_admin' }, user_metadata: { full_name: 'Platform Owner' } };
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({ email, ...attrs });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    for (let page = 1; page < 50 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
      if (!data?.users?.length || data.users.length < 200) break;
    }
    if (!userId) throw new Error('User exists but could not be found');
    const { error: uErr } = await admin.auth.admin.updateUserById(userId, attrs);
    if (uErr) throw uErr;
  } else {
    userId = created.user.id;
  }
  const { error: pErr } = await admin.from('platform_admins').upsert({ user_id: userId });
  if (pErr) throw pErr;
  return userId;
}
