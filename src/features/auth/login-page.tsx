'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FieldFeedback } from '@/components/field-feedback';
import { ROLE_LANDING } from './landing';
import { useSession, type SignInResult } from './session-provider';

type Workspace = 'seller' | 'rider' | 'admin';
const workspaces = {
  seller: { name: 'Seller', title: 'Give every parcel a clear beginning.', description: 'Prepare a delivery and keep its progress in view.', tasks: ['Register a parcel with recipient details', 'Keep tracking numbers together', 'Follow your parcels through each update'] },
  rider: { name: 'Rider', title: 'Your next delivery, clearly laid out.', description: 'Keep your assigned parcels and their next steps together.', tasks: ['See parcels assigned to you', 'Start a delivery from your list', 'Record delivery outcomes'] },
  admin: { name: 'Admin', title: 'Keep the handoffs moving.', description: 'Coordinate people, parcel assignments, and delivery activity.', tasks: ['Assign parcels to riders', 'Manage accounts and access', 'Review delivery activity'] },
};

type Failure = Extract<SignInResult, { ok: false }>;
const wait = (seconds?: number) => !seconds || seconds <= 60 ? 'a minute' : `${Math.ceil(seconds / 60)} minutes`;
// One generic message covers an unknown user, a wrong password and a disabled account, so the form never reveals which.
function failureCopy(failure: Failure): { title: string; detail: string } {
  switch (failure.reason) {
    case 'invalid': return { title: 'Incorrect username or password.', detail: 'Check both, then try again.' };
    case 'rate_limited': return { title: 'Too many sign-in attempts.', detail: `Try again in ${wait(failure.retryAfter)}.` };
    case 'expired': return { title: 'This page timed out.', detail: 'Enter your password again to continue.' };
    case 'busy': return { title: 'Sign-in is busy right now.', detail: 'Wait a moment, then try again.' };
    case 'invalid_input': return { title: 'Those details can’t be used.', detail: 'Use your username and a password of up to 128 characters.' };
    default: return { title: 'We couldn’t reach the server.', detail: 'Check your connection, then try again.' };
  }
}

export function LoginPage({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const session = useSession();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const failureNotice = useRef<HTMLDivElement>(null);
  const selected = workspaces[workspace];
  const signedIn = session.status === 'authenticated' && session.principal;

  // A signed-in person has no use for the form: send them to their workspace.
  useEffect(() => { if (session.status === 'authenticated' && session.principal) router.replace(ROLE_LANDING[session.principal.role]); }, [session.status, session.principal, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors = { username: username.trim() ? undefined : 'Enter your username.', password: password ? undefined : 'Enter your password.' };
    setErrors(nextErrors); setFailure(null);
    if (nextErrors.username) { usernameInput.current?.focus(); return; }
    if (nextErrors.password) { passwordInput.current?.focus(); return; }
    const credentials = { username: username.trim(), password };
    // The password leaves the form as soon as it is sent and is never kept in state, storage or a URL.
    setPassword(''); setVisible(false); setPending(true);
    const result = await session.signIn(credentials);
    setPending(false);
    if (!result.ok) {
      setFailure(result);
      requestAnimationFrame(() => passwordInput.current?.focus());
    }
  }

  return <Card className="sign-in-layout grid gap-0 py-0 ring-0">
    <section className="sign-in-form-panel" aria-labelledby="signin-title"><h1 id="signin-title">Sign in</h1><p className="sign-in-intro">Your parcels and deliveries,<br />ready when you are.</p>
      {signedIn ? <p className="guard-status" role="status">You’re already signed in. Opening your workspace…</p> :
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <div className="form-field"><Label htmlFor="username">Username</Label><Input ref={usernameInput} id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={50} value={username} onChange={event => { setUsername(event.target.value); setFailure(null); }} placeholder="Enter your username" aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} /><FieldFeedback id="username-error" error={errors.username} /></div>
        <div className="form-field"><Label htmlFor="password">Password</Label><div className="password-input"><Input ref={passwordInput} id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" maxLength={128} value={password} onChange={event => { setPassword(event.target.value); setFailure(null); }} placeholder="Enter your password" aria-invalid={!!errors.password || !!failure} aria-describedby={errors.password ? 'password-error' : failure ? 'signin-failure' : undefined} /><Button variant="ghost" size="sm" className="h-11 px-2 text-[13px]" type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</Button></div>{errors.password && <p className="field-error" id="password-error" role="alert">{errors.password}</p>}</div>
        <Button className="button sign-in-button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
        {failure && <Alert variant="destructive" className="form-feedback p-4 text-[13px]" id="signin-failure" ref={failureNotice}><AlertTitle className="font-semibold">{failureCopy(failure).title}</AlertTitle><AlertDescription className="text-[13px]"><p>{failureCopy(failure).detail}</p></AlertDescription></Alert>}
        {pending && <p className="sr-only" role="status">Signing in</p>}
      </form>}
      <p className="login-track-link">Checking a delivery? <Link href="/track">Track without signing in</Link></p>
    </section>
    <section className="workspace-preview" aria-labelledby="workspace-title">
      <fieldset className="workspace-switch"><legend id="workspace-legend">Explore a workspace</legend><RadioGroup className="flex gap-2" aria-labelledby="workspace-legend" name="workspace-preview" value={workspace} onValueChange={value => setWorkspace(value as Workspace)}>{(Object.keys(workspaces) as Workspace[]).map(key => <Label className="workspace-option" key={key} htmlFor={'workspace-' + key}><RadioGroupItem id={'workspace-' + key} value={key} /><span>{workspaces[key].name}</span></Label>)}</RadioGroup></fieldset>
      <div className="workspace-preview-content" aria-live="polite"><h2 id="workspace-title">{selected.title}</h2><p>{selected.description}</p><ul>{selected.tasks.map(task => <li key={task}>{task}</li>)}</ul></div>
      <div className="workspace-preview-foot"><Badge variant="outline" className="sample-marker text-xs font-normal">Workspace preview</Badge><p>This preview shows the tasks each workspace will support.</p></div>
    </section>
  </Card>;
}
