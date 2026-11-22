import Link from 'next/link';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';
import HelpTabs from '@/components/HelpTabs';

export default function HelpLayout({ children }) {
  return (
    <div className="min-h-dvh bg-chalk">
      <header className="border-b border-rule bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700 hover:underline">
            <Icon name="arrowRight" size={15} className="rotate-180" /> Back to the main site
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-16 pt-8">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-600">
          <Icon name="info" size={14} /> Help centre
        </div>
        <h1 className="text-3xl font-extrabold text-accent-900 sm:text-4xl">Guides and answers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/75 sm:text-base">
          Plain-language explanations of every part of CoopLedger. Pick the guide for your role, or search the questions below.
        </p>
        <div className="mt-6">
          <HelpTabs />
        </div>
        <div className="mt-8">{children}</div>
      </div>

      <footer className="border-t border-rule bg-white px-5 py-8 text-center text-xs text-ink/75">
        CoopLedger · <Link href="/" className="link">Main site</Link> · <Link href="/login" className="link">Log in</Link>
      </footer>
    </div>
  );
}
