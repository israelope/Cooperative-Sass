'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Sends one anonymous page-view ping per route change. Respects the browser's Do Not Track setting. */
export default function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith('/platform')) return;
    if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
