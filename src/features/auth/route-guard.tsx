'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Role } from '@/shared/constants';
import { ROLE_LABEL, ROLE_LANDING } from './landing';
import { useSession } from './session-provider';

/**
 * Client-side gate for a role workspace. It decides what to render only; every API and server service still
 * checks the session, role and CSRF token itself.
 */
export function RouteGuard({ role, allowPasswordChange = false, signInPath, children }: { role?: Role; allowPasswordChange?: boolean; signInPath?: string; children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const destination = signInPath ?? (session.ended === 'expired' ? '/login?notice=expired' : '/login');
  const held = session.status === 'authenticated' && !!session.principal?.mustChangePassword && !allowPasswordChange;
  useEffect(() => { if (session.status === 'anonymous') router.replace(destination); }, [session.status, destination, router]);
  // A must-change account is taken to the password screen from any private page, not left on a notice.
  useEffect(() => { if (held) router.replace('/account/password'); }, [held, router]);

  if (session.status === 'loading') return <p className="guard-status" role="status">Checking your session…</p>;
  if (session.status === 'anonymous') return <p className="guard-status" role="status">Taking you to sign in…</p>;
  if (session.status === 'error' || !session.principal) {
    return <Alert variant="destructive" className="guard-alert">
      <AlertTitle className="font-semibold">We couldn’t check your session.</AlertTitle>
      <AlertDescription><p>Check your connection, then reload this page.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => window.location.reload()}>Reload page</Button></AlertDescription>
    </Alert>;
  }
  if (session.principal.mustChangePassword && !allowPasswordChange) {
    return <Alert className="guard-alert">
      <AlertTitle className="font-semibold">Change your password before you continue.</AlertTitle>
      <AlertDescription><p>An Admin set this password for you. Choose your own to open your workspace.</p><Link className={buttonVariants({ size: 'sm', className: 'mt-3 mr-2' })} href="/account/password">Change password</Link><Button className="mt-3" variant="outline" size="sm" onClick={() => void session.signOut()}>Sign out</Button></AlertDescription>
    </Alert>;
  }
  if (role && session.principal.role !== role) {
    return <Alert variant="destructive" className="guard-alert">
      <AlertTitle className="font-semibold">This workspace is for {ROLE_LABEL[role]} accounts.</AlertTitle>
      <AlertDescription><p>You’re signed in as {ROLE_LABEL[session.principal.role]}.</p><Link className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })} href={ROLE_LANDING[session.principal.role]}>Go to your workspace</Link></AlertDescription>
    </Alert>;
  }
  // Keyed by identity: signing in as someone else remounts private screens so no state carries over.
  return <Fragment key={session.identityKey}>{children}</Fragment>;
}
