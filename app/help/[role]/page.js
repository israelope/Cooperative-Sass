import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/Icon';
import { ROLES, getRole } from '@/lib/help-content';

export function generateStaticParams() {
  return ROLES.map((role) => ({ role: role.id }));
}

export async function generateMetadata(props) {
  const params = await props.params;
  const role = getRole(params.role);
  if (!role) return { title: 'Guide not found' };
  return {
    title: `${role.label} guide`,
    description: role.summary,
  };
}

export default async function RoleGuide(props) {
  const params = await props.params;
  const role = getRole(params.role);
  if (!role) notFound();

  const otherRoles = ROLES.filter((r) => r.id !== role.id);
  const firstLink = role.steps[0]?.links?.[0];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink/70">
          <Link href="/help" className="link">All guides</Link>
          <Icon name="arrowRight" size={14} />
          <span className="font-semibold text-accent-800">{role.label}</span>
        </p>
        <Link href="/help#faq" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700 hover:underline">
          <Icon name="info" size={15} /> Frequently asked questions
        </Link>
      </div>

      <div className="panel mb-8 p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-700 text-white">
            <Icon name={role.icon} size={22} />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-accent-900 sm:text-3xl">{role.label} guide</h2>
            <p className="mt-1 text-sm font-medium text-ink/70">{role.audience}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/80">{role.summary}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-5">
          {role.steps.map((step, index) => (
            <section key={step.id} id={step.id} className="panel scroll-mt-24 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-sm font-bold text-accent-700">{index + 1}</span>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold text-accent-900">
                    <Icon name={step.icon} size={18} className="text-accent-500" />
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/80">{step.body}</p>
                  {step.note && (
                    <p className="callout-info mt-3 flex-wrap text-xs">
                      <Icon name="info" size={15} className="mt-0.5 shrink-0" /> {step.note}
                    </p>
                  )}
                  {!!step.links?.length && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {step.links.map((link) => (
                        <Link key={link.href} href={link.href} className="btn-quiet btn-sm">
                          {link.label} <Icon name="arrowRight" size={14} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>

        <aside className="hidden lg:block" aria-label="On this page">
          <div className="sticky top-8 rounded-xl bg-white p-4 ring-1 ring-rule">
            <p className="text-xs font-bold uppercase tracking-wider text-accent-600">On this page</p>
            <nav className="mt-3 space-y-1">
              {role.steps.map((step, index) => (
                <a key={step.id} href={`#${step.id}`} className="block rounded-lg px-2 py-1.5 text-sm text-ink/75 hover:bg-accent-50 hover:text-accent-800">
                  <span className="num mr-1.5 text-accent-400">{index + 1}.</span> {step.title}
                </a>
              ))}
            </nav>
            {firstLink && (
              <Link href={firstLink.href} className="btn-primary btn-sm mt-4 w-full">
                Go to the app <Icon name="arrowRight" size={14} />
              </Link>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="text-lg font-bold text-accent-900">Looking for someone else&apos;s guide?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherRoles.map((other) => (
            <Link key={other.id} href={`/help/${other.id}`} className="btn-quiet btn-sm">
              <Icon name={other.icon} size={14} /> {other.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
