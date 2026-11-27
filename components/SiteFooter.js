import Link from 'next/link';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';
import { ROLES } from '@/lib/help-content';

const EXPLORE = [
  { href: '/', label: 'Home' },
  { href: '/register', label: 'Register a cooperative' },
  { href: '/claim', label: 'Claim an account' },
  { href: '/login', label: 'Log in' },
];

const SITE_LINKS = [
  ...EXPLORE,
  { href: '/help', label: 'Help centre' },
  { href: '/help#faq', label: 'Frequently asked questions' },
  { href: '/help#glossary', label: 'Glossary' },
];

function FooterLink({ href, children }) {
  const classes = 'inline-flex items-center gap-1 text-sm leading-relaxed text-ink/75 transition-colors hover:text-accent-700';
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}<Icon name="externalLink" size={13} className="shrink-0" />
      </a>
    );
  }
  return <Link href={href} className={classes}>{children}</Link>;
}

function FooterColumn({ title, links }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-accent-800">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => <li key={link.href}><FooterLink href={link.href}>{link.label}</FooterLink></li>)}
      </ul>
    </nav>
  );
}

/** Shared footer for public pages. Only real routes and real product details. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-white">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink/75">
              Digital passbooks, contributions and loans for thrift &amp; credit societies. Every cooperative gets its own private workspace.
            </p>
            <p className="mt-4 text-xs text-ink/75">
              Online payments by <FooterLink href="https://paystack.com">Paystack</FooterLink>.
            </p>
          </div>

          <FooterColumn title="Explore" links={SITE_LINKS} />
          <FooterColumn title="Role guides" links={ROLES.map((role) => ({ href: `/help/guide/${role.id}`, label: `${role.shortLabel} guide` }))} />

          <nav aria-label="About CoopLedger">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent-800">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink/75">
              CoopLedger is a cooperative accounting platform for thrift and credit societies. Members get a live passbook, officers get contribution and loan records, and every Paystack payment is reconciled in one private workspace.
            </p>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-rule pt-5 text-xs text-ink/75 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CoopLedger. All rights reserved.</p>
          <p>Private by design · Paystack payments · PDF statements</p>
        </div>
      </div>
    </footer>
  );
}
