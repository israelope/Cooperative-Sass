'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-5 py-12 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-bad-100 text-bad-700">
        <Icon name="alertTriangle" size={26} />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-accent-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink/75">
        This page could not be loaded. Try again; if it keeps happening, contact your cooperative&apos;s administrator.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          <Icon name="refresh" size={16} /> Try again
        </button>
        <Link href="/" className="btn-quiet">Go home</Link>
      </div>
      {error?.digest && <p className="mt-4 text-xs text-ink/75">Reference: {error.digest}</p>}
    </main>
  );
}
