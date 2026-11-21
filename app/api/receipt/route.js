import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Redirects to a short-lived signed URL. Storage RLS decides who may read the file. */
export async function GET(req) {
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!path || path.includes('..')) return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
