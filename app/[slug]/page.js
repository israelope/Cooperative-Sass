import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/Icon';
import AuthCard from '@/components/AuthCard';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';

export async function generateMetadata(props) {
  const params = await props.params;
  return { title: params.slug };
}

export default async function CooperativePage(props) {
  const params = await props.params;
  const tenant = await must(
    createServiceClient().from('tenants').select('name, slug, status').eq('slug', params.slug).maybeSingle(),
    'cooperative lookup',
  );
  if (!tenant || tenant.status !== 'active') notFound();

  return (
    <AuthCard
      title={tenant.name}
      intro={`Welcome to the member portal of ${tenant.name}. View your digital passbook, pay your contribution and request loans.`}
      footer={<div className="space-y-2 text-center"><p>Don&apos;t have an account? Ask your cooperative&apos;s officers for a claim code or join link.</p><p><Link href="/help/guide/member#start" className="link">New member? Read the short guide</Link></p></div>}
    >
      <div className="space-y-3">
        <Link href="/login" className="panel flex items-center gap-4 p-4 transition-colors hover:bg-accent-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-700 text-white"><Icon name="logout" size={18} /></span>
          <span className="flex-1"><span className="block font-display font-semibold text-accent-900">I&apos;m already a member</span><span className="text-xs text-ink/75">Log in to your account</span></span>
          <Icon name="arrowRight" size={17} className="text-accent-500" />
        </Link>
        <Link href={`/${tenant.slug}/join`} className="panel flex items-center gap-4 p-4 transition-colors hover:bg-accent-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name="userPlus" size={18} /></span>
          <span className="flex-1"><span className="block font-display font-semibold text-accent-900">Join this cooperative</span><span className="text-xs text-ink/75">Create an account for officer approval</span></span>
          <Icon name="arrowRight" size={17} className="text-accent-500" />
        </Link>
        <Link href="/claim" className="panel flex items-center gap-4 p-4 transition-colors hover:bg-accent-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-marigold-100 text-marigold-700"><Icon name="ticket" size={18} /></span>
          <span className="flex-1"><span className="block font-display font-semibold text-accent-900">I have a claim code</span><span className="text-xs text-ink/75">Activate the account officers created for you</span></span>
          <Icon name="arrowRight" size={17} className="text-accent-500" />
        </Link>
      </div>
    </AuthCard>
  );
}
