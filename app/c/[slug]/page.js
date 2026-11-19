import Link from 'next/link';
import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import { createServiceClient } from '@/lib/supabase/service';

export async function generateMetadata({ params }) {
  return { title: `${params.slug} · CoopLedger` };
}

export default async function CooperativePage({ params }) {
  const { data: tenant } = await createServiceClient().from('tenants').select('name, slug').eq('slug', params.slug).maybeSingle();
  if (!tenant) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">{tenant.name}</h1>
      <p className="mt-2 text-sm text-ink/70">Member area of {tenant.name}. View your digital passbook, pay your contribution and request loans.</p>
      <div className="panel mt-5 space-y-3 p-6">
        <Link href="/login" className="btn-primary w-full">Log in</Link>
        <Link href={`/c/${tenant.slug}/join`} className="btn-quiet w-full">Join this cooperative</Link>
        <Link href="/claim" className="btn-quiet w-full">I have a claim code</Link>
      </div>
    </main>
  );
}
