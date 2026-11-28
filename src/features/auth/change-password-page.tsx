'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiFailure } from '@/shared/api-client';
import { LIMITS } from '@/shared/constants';
import styles from './account.module.css';
import { ROLE_LANDING } from './landing';
import { PasswordField } from './password-field';
import { RouteGuard } from './route-guard';
import { useSession } from './session-provider';

type Field = 'currentPassword' | 'newPassword' | 'confirm';
type Errors = Partial<Record<Field, string>>;
type Failure = { title: string; detail: string };
const order: Field[] = ['currentPassword', 'newPassword', 'confirm'];
const length = (value: string) => Array.from(value).length;
const wait = (seconds?: number) => !seconds || seconds <= 60 ? 'a minute' : `${Math.ceil(seconds / 60)} minutes`;

function check(values: Record<Field, string>): Errors {
  const errors: Errors = {};
  if (!values.currentPassword) errors.currentPassword = 'Enter your current password.';
  if (!values.newPassword) errors.newPassword = 'Choose a new password.';
  else if (length(values.newPassword) < LIMITS.passwordMin || length(values.newPassword) > LIMITS.passwordMax) errors.newPassword = `Use ${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters.`;
  else if (values.newPassword === values.currentPassword) errors.newPassword = 'Choose a password you haven’t used here.';
  if (!values.confirm) errors.confirm = 'Enter the new password again.';
  else if (values.confirm !== values.newPassword) errors.confirm = 'The two passwords don’t match.';
  return errors;
}

function Screen({ onChanged }: { onChanged(): void }) {
  const session = useSession();
  const [values, setValues] = useState<Record<Field, string>>({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // Remounts the password fields after each submit so a revealed password goes back to hidden.
  const [attempt, setAttempt] = useState(0);
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
  const principal = session.principal!;
  const mustChange = principal.mustChangePassword;

  const set = (field: Field) => (value: string) => { setValues(current => ({ ...current, [field]: value })); setFailure(null); };
  const focusFirst = (found: Errors) => { const first = order.find(field => found[field]); if (first) inputs.current[first]?.focus(); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = check(values);
    setErrors(found); setFailure(null);
    if (Object.keys(found).length) { focusFirst(found); return; }
    const body = JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    // All three passwords leave the form as soon as they are sent and are never kept in storage or a URL.
    setValues({ currentPassword: '', newPassword: '', confirm: '' }); setAttempt(count => count + 1); setPending(true);
    try {
      await session.request('/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      // The server ended every session of this account, this one included. Nobody is signed in again: forgetting the
      // identity makes the route guard send the person to sign in, with the notice chosen by `onChanged`.
      onChanged();
      session.expire();
    } catch (error) {
      setPending(false);
      if (error instanceof ApiFailure && error.code === 'CURRENT_PASSWORD_INVALID') {
        const wrong: Errors = { currentPassword: 'That is not your current password.' };
        setErrors(wrong); requestAnimationFrame(() => focusFirst(wrong));
      } else if (error instanceof ApiFailure && error.status === 422 && error.fields?.newPassword) {
        const weak: Errors = { newPassword: error.fields.newPassword };
        setErrors(weak); requestAnimationFrame(() => focusFirst(weak));
      } else if (error instanceof ApiFailure && error.status === 429) {
        setFailure({ title: 'Too many wrong passwords.', detail: `For your safety, try again in ${wait(error.retryAfter)}.` });
      } else if (error instanceof ApiFailure && error.code === 'CSRF_INVALID') {
        setFailure({ title: 'This page timed out.', detail: 'Reload the page, then enter your passwords again.' });
      } else if (error instanceof ApiFailure && error.status === 503) {
        setFailure({ title: 'Password changes are busy right now.', detail: 'Wait a moment, then try again.' });
      } else if (error instanceof ApiFailure && error.status === 401) {
        // The session is gone: the route guard takes over and sends the person to sign in.
      } else {
        setFailure({ title: 'We couldn’t change your password.', detail: 'Your password was not changed. Check your connection, then try again.' });
      }
    }
  }

  return <div className={`page-width ${styles.page}`}>
    <div className={styles.main}>
      <h1 className={styles.heading}>{mustChange ? 'Set a new password' : 'Change your password'}</h1>
      <p className={styles.intro}>{mustChange
        ? 'An Admin set your current password. Choose your own to continue to your workspace.'
        : `Signed in as ${principal.displayName}. Enter your current password, then choose a new one.`}</p>
      <form method="post" className={styles.form} onSubmit={submit} noValidate aria-busy={pending} aria-label="Change your password">
        <div className={styles.field}><PasswordField key={`current-${attempt}`} ref={element => { inputs.current.currentPassword = element; }} id="currentPassword" label="Current password" autoComplete="current-password"
          value={values.currentPassword} onChange={set('currentPassword')} disabled={pending} error={errors.currentPassword} /></div>
        <div className={styles.field}><PasswordField key={`new-${attempt}`} ref={element => { inputs.current.newPassword = element; }} id="newPassword" label="New password" autoComplete="new-password"
          value={values.newPassword} onChange={set('newPassword')} disabled={pending} error={errors.newPassword} hint={`${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters. Avoid common passwords.`} /></div>
        <div className={styles.field}><PasswordField key={`confirm-${attempt}`} ref={element => { inputs.current.confirm = element; }} id="confirm" label="Confirm new password" autoComplete="new-password"
          value={values.confirm} onChange={set('confirm')} disabled={pending} error={errors.confirm} /></div>
        <Button className={styles.submit} type="submit" disabled={pending}>{pending ? 'Changing password…' : 'Change password'}</Button>
        {failure && <Alert variant="destructive" className={`${styles.notice} p-4 text-[13px]`}><AlertTitle className="font-semibold">{failure.title}</AlertTitle><AlertDescription className="text-[13px]"><p>{failure.detail}</p></AlertDescription></Alert>}
        {pending && <p className="sr-only" role="status">Changing your password</p>}
      </form>
      {!mustChange && <p className={styles.links}><Link href={ROLE_LANDING[principal.role]}>Back to your workspace</Link></p>}
    </div>
    <aside className={styles.aside} aria-labelledby="password-aside">
      <h2 id="password-aside">What happens next</h2>
      <ul>
        <li>You’ll be signed out everywhere, including this device, and sign in again with the new password.</li>
        <li>If your current password is wrong, nothing changes.</li>
        <li>Never share your password. An Admin can reset it for you but can’t read it.</li>
      </ul>
    </aside>
  </div>;
}

/** A06: the signed-in account changes its own password. Reachable while a password change is still required. */
export function ChangePasswordPage() {
  const [signInPath, setSignInPath] = useState<string>();
  return <RouteGuard allowPasswordChange signInPath={signInPath}><Screen onChanged={() => setSignInPath('/login?notice=password-changed')} /></RouteGuard>;
}
