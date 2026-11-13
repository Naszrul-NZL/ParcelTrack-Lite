'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FieldFeedback } from '@/components/field-feedback';

type Workspace = 'seller' | 'rider' | 'admin';
const workspaces = {
  seller: { name: 'Seller', title: 'Give every parcel a clear beginning.', description: 'Prepare a delivery and keep its progress in view.', tasks: ['Register a parcel with recipient details', 'Keep tracking numbers together', 'Follow your parcels through each update'] },
  rider: { name: 'Rider', title: 'Your next delivery, clearly laid out.', description: 'Keep your assigned parcels and their next steps together.', tasks: ['See parcels assigned to you', 'Start a delivery from your list', 'Record delivery outcomes'] },
  admin: { name: 'Admin', title: 'Keep the handoffs moving.', description: 'Coordinate people, parcel assignments, and delivery activity.', tasks: ['Assign parcels to riders', 'Manage accounts and access', 'Review delivery activity'] },
};

export function SignInPreview({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const notice = useRef<HTMLDivElement>(null);
  const selected = workspaces[workspace];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = { username: username.trim() ? undefined : 'Enter your username.', password: password ? undefined : 'Enter your password.' };
    setErrors(nextErrors); setSubmitted(false);
    if (nextErrors.username) { usernameInput.current?.focus(); return; }
    if (nextErrors.password) { passwordInput.current?.focus(); return; }
    setPassword(''); setVisible(false); setSubmitted(true);
    requestAnimationFrame(() => notice.current?.focus());
  }

  return <Card className="sign-in-layout grid gap-0 py-0 ring-0">
    <section className="sign-in-form-panel" aria-labelledby="signin-title"><h1 id="signin-title">Sign in</h1><p className="sign-in-intro">Your parcels and deliveries,<br />ready when you are.</p>
      <form onSubmit={submit} noValidate>
        <div className="form-field"><Label htmlFor="username">Username</Label><Input ref={usernameInput} id="username" name="username" autoComplete="username" maxLength={50} value={username} onChange={event => { setUsername(event.target.value); setSubmitted(false); }} placeholder="Enter your username" aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined} /><FieldFeedback id="username-error" error={errors.username} /></div>
        <div className="form-field"><Label htmlFor="password">Password</Label><div className="password-input"><Input ref={passwordInput} id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" maxLength={128} value={password} onChange={event => { setPassword(event.target.value); setSubmitted(false); }} placeholder="Enter your password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} /><Button variant="ghost" size="sm" className="h-11 px-2 text-[13px]" type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</Button></div>{errors.password && <p className="field-error" id="password-error" role="alert">{errors.password}</p>}</div>
        <Button className="button sign-in-button" type="submit">Sign in</Button>
        {submitted && <Alert className="form-feedback border-0 bg-accent p-4 text-[13px]" role="status" ref={notice} tabIndex={-1}><AlertTitle className="font-semibold">You’ve reached the end of the preview.</AlertTitle><AlertDescription className="text-[13px] text-foreground"><p>Sign-in is not connected yet. Your details were not sent or saved, and the password field has been cleared.</p></AlertDescription></Alert>}
      </form>
      <div className="sign-in-preview-note"><strong>Interface preview</strong><p>Account sign-in is not connected yet. Use sample details to explore this form.</p></div>
      <p className="login-track-link">Checking a delivery? <Link href="/track">Track without signing in</Link></p>
    </section>
    <section className="workspace-preview" aria-labelledby="workspace-title">
      <fieldset className="workspace-switch"><legend id="workspace-legend">Explore a workspace</legend><RadioGroup className="flex gap-2" aria-labelledby="workspace-legend" name="workspace-preview" value={workspace} onValueChange={value => setWorkspace(value as Workspace)}>{(Object.keys(workspaces) as Workspace[]).map(key => <Label className="workspace-option" key={key} htmlFor={'workspace-' + key}><RadioGroupItem id={'workspace-' + key} value={key} /><span>{workspaces[key].name}</span></Label>)}</RadioGroup></fieldset>
      <div className="workspace-preview-content" aria-live="polite"><h2 id="workspace-title">{selected.title}</h2><p>{selected.description}</p><ul>{selected.tasks.map(task => <li key={task}>{task}</li>)}</ul></div>
      <div className="workspace-preview-foot"><Badge variant="outline" className="sample-marker text-xs font-normal">Workspace preview</Badge><p>This preview shows the tasks each workspace will support.</p></div>
    </section>
  </Card>;
}
