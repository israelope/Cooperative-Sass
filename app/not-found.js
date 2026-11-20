import Link from 'next/link';
import Icon from '@/components/Icon';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-5 py-12 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-adire-50 text-adire-500">
        <Icon name="search" size={26} />
      </span>
      <p className="mt-5 font-display text-sm font-bold uppercase tracking-widest text-adire-500">404</p>
      <h1 className="mt-1 text-2xl font-bold text-adire-900">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-ink/75">
        The link may be old, or the cooperative you are looking for may no longer be available.
      </p>
      <Link href="/" className="btn-primary mt-6"><Icon name="home" size={16} /> Back to CoopLedger</Link>
    </main>
  );
}
