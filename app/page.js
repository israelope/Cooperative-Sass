import Image from 'next/image';
import Link from 'next/link';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';
import SiteFooter from '@/components/SiteFooter';
import { FAQS } from '@/lib/help-content';

const AUDIENCES = [
  { icon: 'settings', image: '/images/admin-meeting.jpg', imageAlt: 'Cooperative officers planning together around a laptop', title: 'Cooperative owners & admins', text: 'Set up your society, bring members over from paper, approve accounts and see every naira in one place.', href: '/help/admin', cta: 'Read the admin guide' },
  { icon: 'receipt', image: '/images/bookkeeper-records.jpg', imageAlt: 'A bookkeeper checking receipts and recording expenses', title: 'Bookkeepers & treasurers', text: 'Record cash and transfers with receipts, reconcile online payments and issue statements without chasing alerts.', href: '/help/bookkeeper', cta: 'Read the bookkeeper guide' },
  { icon: 'wallet', image: '/images/member-payment.jpg', imageAlt: 'A member paying a contribution with a smartphone', title: 'Members', text: 'Pay contributions any time, check your passbook and loan limit, and download your own statement.', href: '/help/member', cta: 'Read the member guide' },
];

const SAMPLE = [
  ['03 Oct', 'Online payment', '25,000.00', '410,000.00'],
  ['05 Sep', 'Cash payment', '25,000.00', '385,000.00'],
  ['02 Aug', 'Online payment', '25,000.00', '360,000.00'],
  ['01 Jul', 'Opening balance', '335,000.00', '335,000.00'],
];

const STEPS = [
  { icon: 'building', title: 'Register your society', text: 'Get a private workspace, your own member link and an admin login in minutes.' },
  { icon: 'userPlus', title: 'Bring your members over', text: 'Upload a spreadsheet and hand out claim codes. No passwords to create by hand.' },
  { icon: 'wallet', title: 'Watch the passbook fill itself', text: 'Members pay online; payments are verified and posted without copying bank alerts.' },
];

const FEATURES = [
  { icon: 'shield', title: 'Each society is walled off', text: 'One cooperative can never see another’s members or money. The database itself enforces the wall, not just the app.' },
  { icon: 'refresh', title: 'Online payments post themselves', text: 'Contributions and loan repayments go straight to the cooperative’s own bank account through Paystack.' },
  { icon: 'receipt', title: 'Cash still counts', text: 'Bookkeepers record cash and transfers with a photo of the receipt, so members can check every entry.' },
  { icon: 'bank', title: 'Loans, end to end', text: 'Request, approve, pay out and repay — with a clear loan limit derived from each member’s savings.' },
  { icon: 'fileText', title: 'Statements on demand', text: 'Members download their own PDF passbook; officers export cooperative statements and CSV ledgers.' },
  { icon: 'card', title: 'A membership card for every member', text: 'Each member gets a digital card with their number, ready to show when they pay in cash.' },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-rule/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-5">
          <Logo />
          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="Account">
            <Link href="/help" aria-label="Help centre" title="Help centre" className="btn-quiet btn-sm">
              <Icon name="info" size={15} /><span className="hidden sm:inline">Help centre</span>
            </Link>
            <Link href="/claim" aria-label="Claim account" title="Claim account" className="btn-quiet btn-sm">
              <Icon name="ticket" size={15} /><span className="hidden sm:inline">Claim account</span>
            </Link>
            <Link href="/login" aria-label="Log in" className="btn-primary btn-sm">
              <Icon name="logout" size={15} /><span>Log in</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-accent-100/70 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-40 h-[28rem] w-[28rem] rounded-full bg-marigold-100/50 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 md:grid-cols-2 md:pt-16">
          <div>
            <span className="badge-info"><Icon name="sparkles" size={13} /> Built for thrift &amp; credit societies</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.07] text-accent-900 sm:text-5xl lg:text-[3.4rem]">
              The passbook that updates itself when your members pay.
            </h1>
            <p className="mt-5 max-w-prose text-lg leading-relaxed text-ink/75">
              CoopLedger gives every thrift and credit society its own private workspace. Members see their savings and loan limit any time of day. Treasurers stop copying bank alerts into ledgers.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register" className="btn-gold"><Icon name="building" size={17} /> Register your cooperative</Link>
              <Link href="/claim" className="btn-quiet"><Icon name="ticket" size={17} /> I have a claim code</Link>
            </div>
            <p className="mt-4 text-sm text-ink/75">Moving from paper? Upload a spreadsheet and hand each member a claim code. No one creates 500 passwords by hand.</p>
            <p className="mt-3 text-sm"><Link href="/help" className="link inline-flex items-center gap-1">New here? See the step-by-step guides <Icon name="arrowRight" size={14} /></Link></p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-accent-800">
              <li className="inline-flex items-center gap-2"><Icon name="shield" size={16} className="text-accent-500" /> Private by design</li>
              <li className="inline-flex items-center gap-2"><Icon name="card" size={16} className="text-accent-500" /> Paystack payments</li>
              <li className="inline-flex items-center gap-2"><Icon name="download" size={16} className="text-accent-500" /> PDF statements</li>
            </ul>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-accent-100 ring-1 ring-rule shadow-[0_18px_40px_-24px_rgba(20,23,43,.35)] sm:aspect-[16/10]">
              <Image
                src="/images/hero-mobile-payment.jpg"
                alt="Two members using their phones to make a contribution"
                fill
                priority
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-accent-900/65 via-accent-900/10 to-transparent" />
              <p className="absolute bottom-4 left-4 max-w-[85%] text-sm font-semibold leading-snug text-white drop-shadow-sm">
                Pay from anywhere. The passbook updates itself.
              </p>
            </div>
            <div className="passbook-page relative mt-4 p-5 pl-12 shadow-[0_18px_40px_-24px_rgba(20,23,43,.35)] md:-mt-10 md:ml-8" aria-label="Sample digital passbook">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-semibold text-accent-800">Adeola Thrift Society · Member 014</p>
                  <p className="mt-1 text-sm text-ink/75">Savings balance</p>
                </div>
                <span className="badge-ok"><Icon name="checkCircle" size={12} /> Up to date</span>
              </div>
              <p className="num mt-1 font-display text-4xl font-extrabold text-accent-900">₦410,000.00</p>
              <div className="table-wrap mt-4">
                <table className="tbl num">
                  <caption className="sr-only">Example passbook entries and running balance</caption>
                  <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {SAMPLE.map((r) => (
                      <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td className="text-right">{r[2]}</td><td className="text-right font-semibold">{r[3]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="who-its-for" className="border-t border-rule bg-chalk">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <span className="badge-info"><Icon name="users" size={13} /> Who it&apos;s for</span>
          <h2 className="mt-3 text-2xl font-bold text-accent-900 sm:text-3xl">Everyone in your society has a place here</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink/75">
            Each role sees the tools it needs, with a short guide that explains every page. Choose yours to see exactly what you can do.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((audience) => (
              <div key={audience.title} className="panel overflow-hidden">
                <div className="aspect-[16/7] w-full overflow-hidden bg-accent-50">
                  <Image src={audience.image} alt={audience.imageAlt} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                </div>
                <div className="p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name={audience.icon} size={19} /></span>
                  <h3 className="mt-3 font-display text-lg font-bold text-accent-900">{audience.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink/75">{audience.text}</p>
                  <Link href={audience.href} className="link mt-3 inline-flex items-center gap-1 text-sm">
                    {audience.cta} <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-rule bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-center text-2xl font-bold text-accent-900 sm:text-3xl">From paper to passbook in three steps</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink/75">No migration project, no IT department. Just your records, your members and a link to share.</p>
          <div className="mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-accent-50 ring-1 ring-rule sm:aspect-[16/5]">
            <Image src="/images/community-meeting.jpg" alt="Members of a cooperative meeting together in Lagos" fill sizes="100vw" className="object-cover" />
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="panel relative p-6">
                <span className="num absolute right-5 top-4 text-4xl font-extrabold text-accent-50">{i + 1}</span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name={s.icon} size={20} /></span>
                <h3 className="mt-4 font-display text-lg font-bold text-accent-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-rule bg-chalk">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-bold text-accent-900 sm:text-3xl">Everything a cooperative needs, in one place</h2>
          <p className="mt-2 max-w-prose text-sm text-ink/75">Built around the way societies actually keep money — contributions, loans and careful records.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="panel p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name={f.icon} size={19} /></span>
                <h3 className="mt-4 flex items-center gap-2 font-display text-base font-bold text-accent-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-rule bg-chalk">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="badge-info"><Icon name="info" size={13} /> Good to know</span>
          <h2 className="mt-3 text-2xl font-bold text-accent-900 sm:text-3xl">Questions people ask first</h2>
          <div className="mt-6 space-y-2">
            {FAQS.slice(0, 5).map((item) => (
              <details key={item.q} className="panel group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-accent-900 marker:hidden">
                  {item.q}
                  <Icon name="arrowRight" size={16} className="shrink-0 text-accent-500 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">{item.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-5 text-sm"><Link href="/help#faq" className="link inline-flex items-center gap-1">More questions and the full glossary <Icon name="arrowRight" size={14} /></Link></p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-accent-900 text-white">
        <Image src="/images/community-meeting.jpg" alt="" aria-hidden="true" fill sizes="100vw" className="object-cover opacity-25" />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-accent-900 via-accent-900/90 to-accent-900/60" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-12">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to put your ledger online?</h2>
            <p className="mt-2 max-w-xl text-sm text-accent-100">Create your cooperative&apos;s workspace today. You can add payout details whenever you are ready.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-gold"><Icon name="building" size={17} /> Register your cooperative</Link>
            <Link href="/login" className="btn-quiet"><Icon name="logout" size={17} /> Log in</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
