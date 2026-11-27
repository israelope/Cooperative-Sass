import Link from 'next/link';
import Icon from '@/components/Icon';
import GuideImage from '@/components/GuideImage';
import { ROLES, GLOSSARY, FAQS } from '@/lib/help-content';

export const metadata = {
  title: 'Help centre',
  description: 'Guides, frequently asked questions and a glossary for CoopLedger members, admins and bookkeepers.',
};

export default function HelpHome() {
  return (
    <>
      <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-24">
        <h2 id="roles-heading" className="text-xl font-bold text-accent-900">Start with your role</h2>
        <p className="mt-1 text-sm text-ink/75">Each guide is a short set of steps that follows the real pages in the app.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ROLES.map((role) => (
            <Link key={role.id} href={`/help/guide/${role.id}`} className="panel group min-w-0 overflow-hidden">
              <GuideImage src={role.image} alt={role.imageAlt} aspect="aspect-[16/8] sm:aspect-[16/7]" />
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                    <Icon name={role.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold text-accent-900">{role.label}</h3>
                    <p className="mt-1 text-sm text-ink/70">{role.audience}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">{role.summary}</p>
                <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-700 group-hover:underline">
                  Read the {role.shortLabel} guide <Icon name="arrowRight" size={15} />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="callout-info mt-8 flex-wrap sm:flex-nowrap">
        <Icon name="sparkles" size={18} className="mt-0.5" />
        <div>
          <p className="font-semibold">New to CoopLedger?</p>
          <p className="mt-0.5">
            The <Link href="/help/guide/admin" className="link">admin setup guide</Link> walks through registration, adding members and recording your first payment in order.
            Members should start with <Link href="/help/guide/member#start" className="link">getting into your account</Link>.
          </p>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className="mt-12 scroll-mt-24">
        <h2 id="faq-heading" className="text-xl font-bold text-accent-900">Frequently asked questions</h2>
        <div className="mt-4 space-y-2">
          {FAQS.map((item) => (
            <details key={item.q} className="panel group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-accent-900 marker:hidden">
                {item.q}
                <Icon name="arrowRight" size={16} className="shrink-0 text-accent-500 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="glossary" aria-labelledby="glossary-heading" className="mt-12 scroll-mt-24">
        <h2 id="glossary-heading" className="text-xl font-bold text-accent-900">Glossary</h2>
        <p className="mt-1 text-sm text-ink/75">Words you will come across in the app, explained simply.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="panel p-4">
              <dt className="font-display font-bold text-accent-900">{item.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink/75">{item.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
