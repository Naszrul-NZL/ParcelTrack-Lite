'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldFeedback } from '@/components/field-feedback';
import { ApiFailure, createApiClient } from '@/shared/api-client';
import { LIMITS } from '@/shared/constants';
import { csrfResponseSchema, displayNameSchema, principalSchema, usernameSchema } from '@/shared/schemas';
import styles from './account.module.css';
import { ROLE_LANDING } from './landing';
import { PasswordField } from './password-field';
import { useSession } from './session-provider';

type Field = 'username' | 'displayName' | 'password' | 'confirm';
type Errors = Partial<Record<Field, string>>;
type Failure = { title: string; detail: string };
const order: Field[] = ['username', 'displayName', 'password', 'confirm'];
const USERNAME_RULE = 'Use 3 to 50 letters, numbers, dots, dashes or underscores.';
const length = (value: string) => Array.from(value).length;
const wait = (seconds?: number) => !seconds || seconds <= 60 ? 'a minute' : `${Math.ceil(seconds / 60)} minutes`;

/** The browser checks only what it can say clearly; the server repeats every rule and stays the authority. */
function check(values: Record<Field, string>): Errors {
  const errors: Errors = {};
  if (!values.username.trim()) errors.username = 'Enter a username.';
  else if (!usernameSchema.safeParse(values.username).success) errors.username = USERNAME_RULE;
  if (!values.displayName.trim()) errors.displayName = 'Enter the name to show on your account.';
  else if (!displayNameSchema.safeParse(values.displayName).success) errors.displayName = 'Use 1 to 80 characters.';
  if (!values.password) errors.password = 'Choose a password.';
  else if (length(values.password) < LIMITS.passwordMin || length(values.password) > LIMITS.passwordMax) errors.password = `Use ${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters.`;
  if (!values.confirm) errors.confirm = 'Enter the password again.';
  else if (values.confirm !== values.password) errors.confirm = 'The two passwords don’t match.';
  return errors;
}

function failureCopy(error: unknown): Failure {
  if (error instanceof ApiFailure) {
    if (error.status === 429) return { title: 'Too many sign-ups from this network.', detail: `Try again in ${wait(error.retryAfter)}.` };
    if (error.code === 'CSRF_INVALID') return { title: 'This page timed out.', detail: 'Enter your password again and submit to continue.' };
    if (error.status === 503) return { title: 'Registration is busy right now.', detail: 'Wait a moment, then try again.' };
  }
  return { title: 'We couldn’t create your account.', detail: 'Check your connection, then try again.' };
}

/** A02: public Seller registration. The role is never sent; the server decides it. No one is signed in afterwards. */
export function RegisterPage({ fetcher = fetch }: { fetcher?: typeof fetch }) {
  const session = useSession();
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>({ username: '', displayName: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // Remounts the password fields after each submit so a revealed password goes back to hidden.
  const [attempt, setAttempt] = useState(0);
  // The anonymous-session CSRF token lives in memory only, and is fetched on the first submit so merely viewing the
  // page never creates a session.
  const csrf = useRef<string | null>(null);
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
  const signedIn = session.status === 'authenticated' && session.principal;

  useEffect(() => {
    if (session.status === 'authenticated' && session.principal) router.replace(session.principal.mustChangePassword ? '/account/password' : ROLE_LANDING[session.principal.role]);
  }, [session.status, session.principal, router]);

  const set = (field: Field) => (value: string) => { setValues(current => ({ ...current, [field]: value })); setFailure(null); };
  const focusFirst = (found: Errors) => { const first = order.find(field => found[field]); if (first) inputs.current[first]?.focus(); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = check(values);
    setErrors(found); setFailure(null);
    if (Object.keys(found).length) { focusFirst(found); return; }
    const body = JSON.stringify({ username: values.username.trim(), displayName: values.displayName.trim(), password: values.password });
    // The passwords leave the form as soon as they are sent and are never kept in storage or a URL.
    setValues(current => ({ ...current, password: '', confirm: '' })); setAttempt(count => count + 1); setPending(true);
    const api = createApiClient({ fetcher, csrf: () => csrf.current, clearIdentity: () => undefined });
    try {
      csrf.current ??= csrfResponseSchema.parse(await api('/auth/csrf')).csrfToken;
      principalSchema.parse(await api('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
      router.push('/login?notice=registered');
    } catch (error) {
      setPending(false);
      if (error instanceof ApiFailure && error.code === 'CSRF_INVALID') csrf.current = null;
      if (error instanceof ApiFailure && error.code === 'USERNAME_TAKEN') {
        setErrors({ username: 'That username is taken. Try another.' });
        requestAnimationFrame(() => inputs.current.username?.focus());
      } else if (error instanceof ApiFailure && error.status === 422 && error.fields) {
        const server: Errors = {};
        if (error.fields.username) server.username = USERNAME_RULE;
        if (error.fields.displayName) server.displayName = 'Use 1 to 80 characters.';
        if (error.fields.password) server.password = error.fields.password;
        if (Object.keys(server).length) { setErrors(server); requestAnimationFrame(() => focusFirst(server)); }
        else setFailure({ title: 'Those details can’t be used.', detail: 'Check each field, then try again.' });
      } else {
        setFailure(failureCopy(error));
      }
    }
  }

  return <div className={`page-width ${styles.page}`}>
    <div className={styles.main}>
      <h1 className={styles.heading}>Create a Seller account</h1>
      <p className={styles.intro}>Register parcels and follow each delivery. You’ll sign in with the username you choose here.</p>
      {signedIn ? <p className="guard-status mt-6" role="status">You’re already signed in. Opening your workspace…</p> :
      <form method="post" className={styles.form} onSubmit={submit} noValidate aria-busy={pending} aria-label="Create a Seller account">
        <div className={styles.field}>
          <Label htmlFor="username" className="block">Username</Label>
          <Input ref={element => { inputs.current.username = element; }} id="username" name="username" className="mt-2.5" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={50}
            value={values.username} onChange={event => set('username')(event.target.value)} disabled={pending} aria-invalid={!!errors.username}
            aria-describedby={[errors.username ? 'username-error' : null, 'username-hint'].filter(Boolean).join(' ')} />
          <FieldFeedback id="username-error" error={errors.username} />
          <p id="username-hint" className="field-help">3 to 50 letters, numbers, dots, dashes or underscores. Capital letters are saved as lowercase.</p>
        </div>
        <div className={styles.field}>
          <Label htmlFor="displayName" className="block">Display name</Label>
          <Input ref={element => { inputs.current.displayName = element; }} id="displayName" name="displayName" className="mt-2.5" autoComplete="name" maxLength={80}
            value={values.displayName} onChange={event => set('displayName')(event.target.value)} disabled={pending} aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? 'displayName-error' : undefined} />
          <FieldFeedback id="displayName-error" error={errors.displayName} />
        </div>
        <div className={styles.field}><PasswordField key={`password-${attempt}`} ref={element => { inputs.current.password = element; }} id="password" label="Password" autoComplete="new-password"
          value={values.password} onChange={set('password')} disabled={pending} error={errors.password} hint={`${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters. Avoid common passwords.`} /></div>
        <div className={styles.field}><PasswordField key={`confirm-${attempt}`} ref={element => { inputs.current.confirm = element; }} id="confirm" label="Confirm password" autoComplete="new-password"
          value={values.confirm} onChange={set('confirm')} disabled={pending} error={errors.confirm} /></div>
        <Button className={styles.submit} type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</Button>
        {failure && <Alert variant="destructive" className={`${styles.notice} p-4 text-[13px]`}><AlertTitle className="font-semibold">{failure.title}</AlertTitle><AlertDescription className="text-[13px]"><p>{failure.detail}</p></AlertDescription></Alert>}
        {pending && <p className="sr-only" role="status">Creating your account</p>}
      </form>}
      <p className={styles.links}>Already registered? <Link href="/login">Sign in</Link></p>
    </div>
    <aside className={styles.aside} aria-labelledby="register-aside">
      <h2 id="register-aside">Before you start</h2>
      <ul>
        <li>This creates a Seller account. Rider and Admin accounts are set up by an Admin.</li>
        <li>You’re not signed in automatically. After you register, sign in with your new details.</li>
        <li>Your password is never shown again, so choose one you can keep safe.</li>
      </ul>
    </aside>
  </div>;
}
