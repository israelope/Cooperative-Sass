import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import CopyButton from '@/components/CopyButton';
import { requireMember } from '@/lib/auth';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Membership card' };

export default async function MemberCard() {
  const { member, profile } = await requireMember();
  const initials = member.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  return (
    <>
      <PageHeader title="Membership card" intro="Your digital identity in this cooperative. Show your number to an officer when you pay in cash." icon="card" helpKey="memberCard">
        <CopyButton value={member.member_no} label="Copy number" />
      </PageHeader>

      <div className="max-w-xl">
        <div className="relative overflow-hidden rounded-2xl bg-accent-800 p-6 text-white shadow-lg sm:p-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-600/40" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-marigold-500/10" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent-200">{profile.tenants?.name}</p>
              <p className="mt-1 text-sm text-white/80">Member identification</p>
            </div>
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">{initials}</span>
          </div>
          <div className="relative mt-12">
            <p className="font-display text-2xl font-bold sm:text-3xl">{member.full_name}</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-accent-200">Member number</p>
                <p className="num font-mono text-xl font-semibold tracking-wider">{member.member_no}</p>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold capitalize">{member.status}</span>
            </div>
          </div>
          <div className="relative mt-8 flex justify-between border-t border-white/15 pt-4 text-xs text-white/70">
            <span>Member since {formatDate(member.created_at)}</span>
            <span>{profile.tenants?.slug}</span>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-sm text-ink/75">
          <p className="flex items-center gap-2"><Icon name="shield" size={16} className="text-accent-500" /> This card is for identification inside the app; it is not a bank card.</p>
          <p>Phone: {member.phone || 'not provided'} · Claim code: <span className="font-mono">{member.claim_code || 'already activated'}</span></p>
          <p><Link href="/member/passbook" className="link inline-flex items-center gap-1">View your passbook <Icon name="arrowRight" size={14} /></Link></p>
        </div>
      </div>
    </>
  );
}
