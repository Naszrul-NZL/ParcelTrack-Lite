'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_LANDING } from '@/features/auth/landing';
import { useSession } from '@/features/auth/session-provider';

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [failed, setFailed] = useState(false);
  const principal = session.status === 'authenticated' ? session.principal : null;
  const links = [['/', 'Home'], ['/track', 'Track a parcel'], ...(principal ? [[ROLE_LANDING[principal.role], 'Your workspace'], ...(principal.role === 'ADMIN' ? [['/admin/users', 'Accounts']] : []), ['/account/password', 'Password']] : [['/login', 'Sign in'], ['/register', 'Create account']])];

  async function signOut() {
    setFailed(false);
    if (await session.signOut()) router.replace('/login');
    else setFailed(true);
  }

  return <nav aria-label="Main navigation">
    {links.map(([href, label]) =>
      <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>,
    )}
    {principal && <button type="button" className="nav-action" onClick={signOut}>Sign out</button>}
    {failed && <span className="nav-note" role="alert">Couldn’t sign out. Try again.</span>}
  </nav>;
}
