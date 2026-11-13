'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation">
    {[['/', 'Home'], ['/track', 'Track a parcel'], ['/login', 'Sign in']].map(([href, label]) =>
      <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>,
    )}
  </nav>;
}
