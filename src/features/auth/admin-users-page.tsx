'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldFeedback } from '@/components/field-feedback';
import { cn } from '@/lib/utils';
import { ApiFailure } from '@/shared/api-client';
import { LIMITS, ROLES, type Role } from '@/shared/constants';
import { displayNameSchema, usernameSchema, type UserList } from '@/shared/schemas';
import { AdminAuditPanel } from './admin-audit-panel';
import { createAdminUsersApi, isConflict, type AdminUsersApi, type UserFilters, type UserSummary } from './admin-users-api';
import { ROLE_LABEL } from './landing';
import { PasswordField } from './password-field';
import { RouteGuard } from './route-guard';
import { useSession } from './session-provider';

type Listing = { key: string; data?: UserList; error?: unknown };
type Notice = { text: string; error?: boolean };
type Confirm = { kind: 'status' | 'reset'; user: UserSummary; notice?: string };
const length = (value: string) => Array.from(value).length;
const USERNAME_RULE = 'Use 3 to 50 letters, numbers, dots, dashes or underscores.';
const managed = (user: UserSummary) => user.role === 'SELLER' || user.role === 'RIDER';

function CreateRiderForm({ api, onCreated, onCancel }: { api: AdminUsersApi; onCreated(user: UserSummary): void; onCancel(): void }) {
  const [values, setValues] = useState({ username: '', displayName: '', initialPassword: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  // Remounts the password field after each submit so a revealed password returns to hidden.
  const [attempt, setAttempt] = useState(0);
  const refs = useRef<Partial<Record<keyof typeof values, HTMLInputElement | null>>>({});
  const order = ['username', 'displayName', 'initialPassword'] as const;
  const set = (field: keyof typeof values) => (value: string) => { setValues(current => ({ ...current, [field]: value })); setFailure(undefined); };
  const focusFirst = (found: typeof errors) => { const first = order.find(field => found[field]); if (first) requestAnimationFrame(() => refs.current[first]?.focus()); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found: typeof errors = {};
    if (!values.username.trim()) found.username = 'Enter a username.';
    else if (!usernameSchema.safeParse(values.username).success) found.username = USERNAME_RULE;
    if (!values.displayName.trim()) found.displayName = 'Enter the Rider’s name.';
    else if (!displayNameSchema.safeParse(values.displayName).success) found.displayName = 'Use 1 to 80 characters.';
    if (!values.initialPassword) found.initialPassword = 'Enter an initial password.';
    else if (length(values.initialPassword) < LIMITS.passwordMin || length(values.initialPassword) > LIMITS.passwordMax) found.initialPassword = `Use ${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters.`;
    setErrors(found); setFailure(undefined);
    if (Object.keys(found).length) { focusFirst(found); return; }
    const rider = { username: values.username.trim(), displayName: values.displayName.trim(), initialPassword: values.initialPassword };
    // The initial password leaves the form as soon as it is sent and is never shown again.
    setValues(current => ({ ...current, initialPassword: '' })); setAttempt(count => count + 1); setPending(true);
    try {
      onCreated(await api.createRider(rider));
    } catch (error) {
      setPending(false);
      if (error instanceof ApiFailure && error.code === 'USERNAME_TAKEN') { const taken = { username: 'That username is taken. Try another.' }; setErrors(taken); focusFirst(taken); }
      else if (error instanceof ApiFailure && error.status === 422 && error.fields) {
        const server: typeof errors = {};
        if (error.fields.username) server.username = USERNAME_RULE;
        if (error.fields.displayName) server.displayName = 'Use 1 to 80 characters.';
        if (error.fields.initialPassword) server.initialPassword = error.fields.initialPassword;
        if (Object.keys(server).length) { setErrors(server); focusFirst(server); } else setFailure('Those details can’t be used. Check each field, then try again.');
      } else if (error instanceof ApiFailure && error.status === 503) setFailure('Creating accounts is busy right now. Wait a moment, then try again.');
      else if (error instanceof ApiFailure && error.status === 429) setFailure('Too many attempts. Wait a few minutes, then try again.');
      else setFailure('We couldn’t create the account. Check your connection, then try again.');
    }
  }

  return <form method="post" onSubmit={submit} noValidate aria-busy={pending} aria-label="Create a Rider account" className="mt-5 grid gap-5">
    <div>
      <Label htmlFor="rider-username" className="block">Username</Label>
      <Input ref={element => { refs.current.username = element; }} id="rider-username" className="mt-2.5" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={50}
        value={values.username} onChange={event => set('username')(event.target.value)} disabled={pending} aria-invalid={!!errors.username}
        aria-describedby={[errors.username ? 'rider-username-error' : null, 'rider-username-hint'].filter(Boolean).join(' ')} />
      <FieldFeedback id="rider-username-error" error={errors.username} />
      <p id="rider-username-hint" className="field-help">The Rider signs in with this. {USERNAME_RULE}</p>
    </div>
    <div>
      <Label htmlFor="rider-name" className="block">Display name</Label>
      <Input ref={element => { refs.current.displayName = element; }} id="rider-name" className="mt-2.5" autoComplete="off" maxLength={80}
        value={values.displayName} onChange={event => set('displayName')(event.target.value)} disabled={pending} aria-invalid={!!errors.displayName}
        aria-describedby={errors.displayName ? 'rider-name-error' : undefined} />
      <FieldFeedback id="rider-name-error" error={errors.displayName} />
    </div>
    <PasswordField key={`initial-${attempt}`} ref={element => { refs.current.initialPassword = element; }} id="rider-password" label="Initial password" autoComplete="new-password"
      value={values.initialPassword} onChange={set('initialPassword')} disabled={pending} error={errors.initialPassword}
      hint="The Rider must change it at first sign-in, and it stops working after 72 hours if unused. It is not shown again." />
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    <DialogFooter className="mt-1">
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending}>{pending ? 'Creating Rider…' : 'Create Rider'}</Button>
    </DialogFooter>
    {pending && <p className="sr-only" role="status">Creating the Rider account</p>}
  </form>;
}

type Props = { api: AdminUsersApi; adminId?: string; adminName?: string; initialFilters?: Partial<UserFilters> };

export function AdminUsersPage({ api, adminId, adminName, initialFilters }: Props) {
  const [filters, setFilters] = useState<UserFilters>({ role: initialFilters?.role, isActive: initialFilters?.isActive, page: initialFilters?.page ?? 1 });
  const [attempt, setAttempt] = useState(0);
  const [listing, setListing] = useState<Listing>();
  const [notice, setNotice] = useState<Notice>();
  const [confirm, setConfirm] = useState<Confirm>();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ user: UserSummary; password: string }>();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [pending, setPending] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const key = JSON.stringify(filters) + '#' + attempt;

  useEffect(() => {
    const controller = new AbortController();
    void api.listUsers(filters, controller.signal).then(
      data => { if (!controller.signal.aborted) setListing({ key, data }); },
      error => { if (!controller.signal.aborted) setListing({ key, error }); },
    );
    return () => controller.abort();
  }, [api, filters, key]);

  const loaded = listing?.key === key ? listing : undefined;
  const data = loaded?.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = !!(filters.role || filters.isActive !== undefined);

  const say = (next: Notice) => { setNotice(next); queueMicrotask(() => noticeRef.current?.focus()); };
  const refresh = () => setAttempt(count => count + 1);
  function updateFilters(next: Partial<UserFilters>) { setNotice(undefined); setFilters(current => ({ ...current, ...next, page: next.page ?? 1 })); }

  async function changeStatus(current: Confirm) {
    if (pending) return;
    const enable = !current.user.isActive;
    setPending(true);
    try {
      await api.setActive(current.user.id, enable, current.user.version);
      setConfirm(undefined); refresh();
      say({ text: enable ? `${current.user.displayName} can sign in again. Sessions that ended stay ended.` : `${current.user.displayName} is disabled and signed out everywhere.` });
    } catch (error) {
      if (isConflict(error) || (error instanceof ApiFailure && error.status === 404)) {
        setConfirm(undefined); refresh();
        say({ text: 'This account changed or no longer exists. The list has been refreshed; review it, then try again.', error: true });
      } else if (error instanceof ApiFailure && error.code === 'TARGET_NOT_ALLOWED') {
        setConfirm(undefined); say({ text: 'Admin accounts and your own account can’t be disabled here.', error: true });
      } else {
        setConfirm({ ...current, notice: 'We couldn’t save this change. Your access or the connection may have changed. Try again.' });
      }
    } finally { setPending(false); }
  }

  async function resetPassword(current: Confirm) {
    if (pending) return;
    setPending(true);
    try {
      const password = await api.resetPassword(current.user.id);
      setConfirm(undefined); setCopy('idle'); setSecret({ user: current.user, password }); refresh();
    } catch (error) {
      if (error instanceof ApiFailure && (error.status === 404 || error.code === 'TARGET_NOT_ALLOWED')) {
        setConfirm(undefined); refresh();
        say({ text: 'This account can’t be reset here or no longer exists. The list has been refreshed.', error: true });
      } else if (error instanceof ApiFailure && error.status === 503) {
        setConfirm({ ...current, notice: 'Password resets are busy right now. Wait a moment, then try again. Nothing was changed.' });
      } else {
        // An uncertain result may have changed the password already: the account's old password may no longer work.
        setConfirm({ ...current, notice: 'We couldn’t confirm the reset. If you try again, the earlier temporary password stops working.' });
      }
    } finally { setPending(false); }
  }

  async function copyPassword() {
    try { await navigator.clipboard.writeText(secret!.password); setCopy('copied'); } catch { setCopy('failed'); }
  }

  return <section className="grid gap-6" aria-labelledby="admin-users-heading">
    <div className="parcel-workspace-header mb-0!">
      <div>
        <h1 id="admin-users-heading">Accounts</h1>
        {adminName && <p className="section-label">Signed in as {adminName}.</p>}
      </div>
      <Button type="button" onClick={() => { setNotice(undefined); setCreating(true); }}>Create Rider</Button>
    </div>

    <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:max-w-2xl">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="user-role">Role</Label>
        <select id="user-role" className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={filters.role ?? ''}
          onChange={event => updateFilters({ role: ROLES.find(role => role === event.currentTarget.value) })}>
          <option value="">All roles</option>
          {ROLES.map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
        </select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="user-status">Status</Label>
        <select id="user-status" className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={filters.isActive === undefined ? '' : String(filters.isActive)}
          onChange={event => updateFilters({ isActive: event.currentTarget.value === '' ? undefined : event.currentTarget.value === 'true' })}>
          <option value="">Active and disabled</option>
          <option value="true">Active only</option>
          <option value="false">Disabled only</option>
        </select>
      </div>
    </div>

    <p ref={noticeRef} tabIndex={-1} role="status" className={notice ? (notice.error ? 'text-destructive' : 'text-success') : 'sr-only'}>{notice?.text}</p>

    {!loaded && <p role="status" className="text-muted-foreground">Loading accounts…</p>}
    <div aria-busy={!loaded}>
      {!!loaded?.error && <div className="grid justify-items-start gap-3">
        <p role="alert" className="text-destructive">Could not load the account list.</p>
        <Button type="button" variant="outline" onClick={refresh}>Retry account list</Button>
      </div>}
      {data?.total === 0 && <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-3xl">{hasFilters ? 'No matching accounts' : 'No accounts yet'}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{hasFilters ? 'Change the filters to see other accounts.' : 'Accounts will appear here once people register.'}</p>
      </div>}
      {data && data.total > 0 && data.items.length === 0 && <p className="text-muted-foreground">There are no accounts on this page.</p>}
      {!!data?.items.length && <ul aria-label="Accounts" className="divide-y divide-border border-y border-border">
        {data.items.map(user => <li key={user.id} className={cn('grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center', !user.isActive && 'bg-muted px-3')}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold [overflow-wrap:anywhere]">{user.displayName}</span>
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium">{ROLE_LABEL[user.role as Role]}</span>
              {!user.isActive && <span className="rounded-sm border border-destructive px-1.5 py-0.5 text-xs font-medium text-destructive">Disabled</span>}
              {user.mustChangePassword && <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium">Must change password</span>}
              {user.id === adminId && <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">You</span>}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.username}</p>
          </div>
          {managed(user) && user.id !== adminId && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm({ kind: 'reset', user })}>Reset password{' '}<span className="sr-only">for {user.displayName}</span></Button>
            <Button type="button" variant="outline" onClick={() => setConfirm({ kind: 'status', user })}>{user.isActive ? 'Disable' : 'Reactivate'}{' '}<span className="sr-only">{user.displayName}</span></Button>
          </div>}
        </li>)}
      </ul>}
      {data && (pages > 1 || data.page > 1) && <nav aria-label="Account pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={data.page <= 1} onClick={() => updateFilters({ page: data.page - 1 })}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {data.page} of {pages}</span>
        <Button type="button" variant="outline" disabled={data.page >= pages} onClick={() => updateFilters({ page: data.page + 1 })}>Next</Button>
      </nav>}
    </div>

    <AdminAuditPanel api={api} />

    <Dialog open={creating} onOpenChange={open => { if (!open) setCreating(false); }}>
      <DialogContent>
        <DialogTitle>Create a Rider</DialogTitle>
        <DialogDescription>The Rider can be assigned parcels once they exist. They choose their own password at first sign-in.</DialogDescription>
        {creating && <CreateRiderForm api={api} onCancel={() => setCreating(false)}
          onCreated={user => { setCreating(false); refresh(); say({ text: `Rider account created for ${user.displayName} (${user.username}). They must change the initial password at first sign-in.` }); }} />}
      </DialogContent>
    </Dialog>

    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !pending) setConfirm(undefined); }}>
      {confirm && <DialogContent>
        <DialogTitle>{confirm.kind === 'reset' ? 'Reset password?' : confirm.user.isActive ? 'Disable account?' : 'Reactivate account?'}</DialogTitle>
        <DialogDescription>
          {confirm.kind === 'reset'
            ? <>A new temporary password will be made for <strong className="text-foreground">{confirm.user.displayName}</strong> ({confirm.user.username}). It is shown once, here. Their current password stops working and they are signed out everywhere.</>
            : confirm.user.isActive
              ? <><strong className="text-foreground">{confirm.user.displayName}</strong> ({confirm.user.username}) will be signed out at once and can’t sign in until you reactivate them.{confirm.user.role === 'RIDER' && ' Parcels assigned to them stay as they are and appear as needing reassignment.'}</>
              : <><strong className="text-foreground">{confirm.user.displayName}</strong> ({confirm.user.username}) will be able to sign in again. Sessions that ended stay ended.</>}
        </DialogDescription>
        {confirm.notice && <p role="alert" className="mt-4 text-sm text-destructive">{confirm.notice}</p>}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancel</DialogClose>
          <Button type="button" disabled={pending} onClick={() => void (confirm.kind === 'reset' ? resetPassword(confirm) : changeStatus(confirm))}>
            {confirm.kind === 'reset' ? (pending ? 'Resetting password…' : 'Reset password') : confirm.user.isActive ? (pending ? 'Disabling…' : 'Disable account') : (pending ? 'Reactivating…' : 'Reactivate account')}
          </Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>

    <Dialog open={!!secret} onOpenChange={open => { if (!open) setSecret(undefined); }}>
      {secret && <DialogContent>
        <DialogTitle>Temporary password</DialogTitle>
        <DialogDescription>For <strong className="text-foreground">{secret.user.displayName}</strong> ({secret.user.username}). Share it privately. It is shown only now, expires after 72 hours, and they must change it at first sign-in.</DialogDescription>
        <p className="mt-5 select-all rounded-md border border-input bg-muted p-3 font-mono text-base [overflow-wrap:anywhere]" aria-label="Temporary password">{secret.password}</p>
        <p role="status" className={cn('mt-3 min-h-5 text-sm', copy === 'failed' ? 'text-destructive' : 'text-success')}>
          {copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Copying didn’t work. Select the password above and copy it yourself.' : ''}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copyPassword()}>Copy password</Button>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  </section>;
}

function AdminUsersContent({ initialFilters }: { initialFilters?: Partial<UserFilters> }) {
  const { principal, request } = useSession();
  const api = useMemo(() => createAdminUsersApi(request), [request]);
  return <AdminUsersPage api={api} adminId={principal?.id} adminName={principal?.displayName} initialFilters={initialFilters} />;
}

export function AdminUsersWorkspace({ initialFilters }: { initialFilters?: Partial<UserFilters> }) {
  return <div className="page-width parcel-workspace"><RouteGuard role="ADMIN"><AdminUsersContent initialFilters={initialFilters} /></RouteGuard></div>;
}
