'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { scopeHref } from '@/lib/roles';

/** A Link that keeps the /<co-op> prefix on app navigation. */
export default function TenantLink({ href, ...props }) {
  const pathname = usePathname() || '';
  return <Link href={scopeHref(href, pathname)} {...props} />;
}
