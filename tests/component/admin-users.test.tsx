import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/admin/users' }));

import { AdminUsersPage, AdminUsersWorkspace } from '@/features/auth/admin-users-page';
import type { AdminUsersApi, UserSummary } from '@/features/auth/admin-users-api';
import { SessionProvider } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import type { AuditList, UserList } from '@/shared/schemas';

const user = (id: string, username: string, role: UserSummary['role'], extra: Partial<UserSummary> = {}): UserSummary =>
  ({ id, username, displayName: username.toUpperCase(), role, mustChangePassword: false, isActive: true, version: 1, ...extra });
const ADMIN = user('1', 'admin', 'ADMIN');
const SELLER = user('2', 'seller.a', 'SELLER');
const RIDER = user('3', 'rider.a', 'RIDER', { mustChangePassword: true, version: 4 });
const GONE = user('4', 'rider.b', 'RIDER', { isActive: false, version: 2 });
const page = (items: UserSummary[], extra: Partial<UserList> = {}): UserList => ({ items, page: 1, pageSize: 20, total: items.length, ...extra });
const event = (id: string, extra: Partial<AuditList['items'][number]> = {}): AuditList['items'][number] => ({
  id, eventType: 'USER_CREATED', outcome: 'SUCCESS', actorId: '1', targetUserId: '3', parcelId: null, occurredAt: '2026-11-28T02:00:00.000Z', requestId: '11111111-1111-4111-8111-111111111111', details: { role: 'RIDER' }, ...extra,
});

function makeApi(overrides: Partial<AdminUsersApi> = {}) {
  const api = {
    listUsers: vi.fn(async () => page([ADMIN, SELLER, RIDER, GONE])),
    setActive: vi.fn(async (_id: string, isActive: boolean) => ({ ...SELLER, isActive })),
    createRider: vi.fn(async () => user('9', 'rider.new', 'RIDER', { displayName: 'New Rider', mustChangePassword: true })),
    resetPassword: vi.fn(async () => 'Tmp-Password_0123456789ab'),
    listAudit: vi.fn(async () => ({ items: [event('5'), event('4', { eventType: 'LOGIN_FAILED', outcome: 'FAILURE', actorId: null, targetUserId: null, details: { reason: 'bad_password' } })], page: 1, pageSize: 20, total: 2 }) as AuditList),
    ...overrides,
  };
  return api as typeof api & AdminUsersApi;
}
function setup(overrides: Partial<AdminUsersApi> = {}) {
  const api = makeApi(overrides);
  const actor = userEvent.setup();
  render(<AdminUsersPage api={api} adminId="1" adminName="Admin One" />);
  return { api, actor };
}
const row = (name: string) => within(screen.getByRole('list', { name: 'Accounts' })).getAllByRole('listitem').find(item => item.querySelector('p > span')?.textContent === name)!;

beforeEach(() => { cleanup(); });

describe('M1-PH3-TC16 Admin accounts screen: list and filters (A07)', () => {
  it('lists accounts with role, status and password badges, and actions only for other Sellers and Riders', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
    const admin = row('ADMIN');
    expect(within(admin).getByText('You')).toBeInTheDocument();
    expect(within(admin).queryByRole('button')).not.toBeInTheDocument();
    const seller = row('SELLER.A');
    expect(within(seller).getByRole('button', { name: 'Disable SELLER.A' })).toBeInTheDocument();
    expect(within(seller).getByRole('button', { name: 'Reset password for SELLER.A' })).toBeInTheDocument();
    expect(within(row('RIDER.A')).getByText('Must change password')).toBeInTheDocument();
    const disabled = row('RIDER.B');
    expect(within(disabled).getByText('Disabled')).toBeInTheDocument();
    expect(within(disabled).getByRole('button', { name: 'Reactivate RIDER.B' })).toBeInTheDocument();
  });

  it('renders account names as text, never markup', async () => {
    setup({ listUsers: vi.fn(async () => page([user('7', 'x.y', 'SELLER', { displayName: '<img src=x onerror=alert(1)>' })])) });
    expect((await screen.findAllByText('<img src=x onerror=alert(1)>')).length).toBeGreaterThan(0);
    expect(document.querySelector('img')).toBeNull();
  });

  it('asks for a new page when the role or status filter changes, and for page 1', async () => {
    const { api, actor } = setup();
    await screen.findByRole('list', { name: 'Accounts' });
    await actor.selectOptions(screen.getByLabelText('Role'), 'RIDER');
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith({ role: 'RIDER', isActive: undefined, page: 1 }, expect.any(AbortSignal)));
    await actor.selectOptions(screen.getByLabelText('Status'), 'false');
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith({ role: 'RIDER', isActive: false, page: 1 }, expect.any(AbortSignal)));
  });

  it('pages through a long list', async () => {
    const { api, actor } = setup({ listUsers: vi.fn(async (filters: { page: number }) => page([SELLER], { page: filters.page, total: 45 })) });
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('tells first use from no filter match, and offers a retry when loading fails', async () => {
    const listUsers = vi.fn<AdminUsersApi['listUsers']>().mockRejectedValueOnce(new ApiFailure(500, 'INTERNAL_ERROR')).mockResolvedValue(page([]));
    const { actor } = setup({ listUsers });
    expect(await screen.findByText('Could not load the account list.')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Retry account list' }));
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    await actor.selectOptions(screen.getByLabelText('Role'), 'SELLER');
    expect(await screen.findByText('No matching accounts')).toBeInTheDocument();
  });
});

describe('M1-PH3-TC16 disable and reactivate (A09)', () => {
  it('names the account in a confirmation, sends the listed version, refreshes and confirms', async () => {
    const { api, actor } = setup();
    await actor.click(await screen.findByRole('button', { name: 'Disable SELLER.A' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Disable account?' })).toBeInTheDocument();
    expect(within(dialog).getByText('SELLER.A')).toBeInTheDocument();
    expect(api.setActive).not.toHaveBeenCalled();
    await actor.click(within(dialog).getByRole('button', { name: 'Disable account' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('2', false, 1));
    expect(await screen.findByText('SELLER.A is disabled and signed out everywhere.')).toBeInTheDocument();
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns that a Rider’s parcels stay assigned and need reassignment', async () => {
    const { actor } = setup();
    await actor.click(await screen.findByRole('button', { name: 'Disable RIDER.A' }));
    expect(await screen.findByText(/appear as needing reassignment/)).toBeInTheDocument();
  });

  it('reactivates with the right wording and the disabled version', async () => {
    const { api, actor } = setup();
    await actor.click(await screen.findByRole('button', { name: 'Reactivate RIDER.B' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Reactivate account?' })).toBeInTheDocument();
    await actor.click(within(dialog).getByRole('button', { name: 'Reactivate account' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('4', true, 2));
    expect(await screen.findByText(/can sign in again/)).toBeInTheDocument();
  });

  it('shows a pending label and cannot be submitted twice', async () => {
    let finish!: () => void;
    const setActive = vi.fn(() => new Promise<UserSummary>(resolve => { finish = () => resolve(SELLER); }));
    const { actor } = setup({ setActive });
    await actor.click(await screen.findByRole('button', { name: 'Disable SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Disable account' }));
    const pending = await screen.findByRole('button', { name: 'Disabling…' });
    expect(pending).toBeDisabled();
    await actor.click(pending);
    expect(setActive).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refreshes the list and explains when the account changed under the Admin (409)', async () => {
    const { api, actor } = setup({ setActive: vi.fn(async () => { throw new ApiFailure(409, 'VERSION_CONFLICT'); }) });
    await actor.click(await screen.findByRole('button', { name: 'Disable SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Disable account' }));
    expect(await screen.findByText(/changed or no longer exists/)).toBeInTheDocument();
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with a recovery message on an unexpected failure', async () => {
    const { actor } = setup({ setActive: vi.fn(async () => { throw new TypeError('network'); }) });
    await actor.click(await screen.findByRole('button', { name: 'Disable SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Disable account' }));
    expect(await screen.findByText(/We couldn’t save this change/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('M1-PH3-TC16 password reset (A21)', () => {
  it('confirms by name, shows the temporary password once, and removes it when done', async () => {
    const { api, actor } = setup();
    await actor.click(await screen.findByRole('button', { name: 'Reset password for SELLER.A' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByRole('heading', { name: 'Reset password?' })).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
    await actor.click(within(confirm).getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith('2'));
    const secret = await screen.findByRole('dialog', { name: 'Temporary password' });
    expect(within(secret).getByLabelText('Temporary password')).toHaveTextContent('Tmp-Password_0123456789ab');
    await actor.click(within(secret).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Tmp-Password_0123456789ab')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Tmp-Password_0123456789ab');
  });

  it('confirms Copied only after the clipboard accepts it, and explains a failed copy', async () => {
    const { actor } = setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await actor.click(await screen.findByRole('button', { name: 'Reset password for SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Reset password' }));
    const secret = await screen.findByRole('dialog', { name: 'Temporary password' });
    await actor.click(within(secret).getByRole('button', { name: 'Copy password' }));
    expect(await within(secret).findByText('Copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('Tmp-Password_0123456789ab');
    await actor.click(within(secret).getByRole('button', { name: 'Copy password' }));
    expect(await within(secret).findByText(/Copying didn’t work/)).toBeInTheDocument();
  });

  it('keeps the confirmation open and says nothing was changed when the hasher is busy', async () => {
    const { actor } = setup({ resetPassword: vi.fn(async () => { throw new ApiFailure(503, 'BUSY'); }) });
    await actor.click(await screen.findByRole('button', { name: 'Reset password for SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText(/busy right now.*Nothing was changed/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Temporary password' })).not.toBeInTheDocument();
  });

  it('refreshes when the account is gone', async () => {
    const { api, actor } = setup({ resetPassword: vi.fn(async () => { throw new ApiFailure(404, 'NOT_FOUND'); }) });
    await actor.click(await screen.findByRole('button', { name: 'Reset password for SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText(/can’t be reset here or no longer exists/)).toBeInTheDocument();
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
  });
});

describe('M1-PH3-TC15 create a Rider (A08)', () => {
  async function openForm(actor: ReturnType<typeof userEvent.setup>) {
    await actor.click(await screen.findByRole('button', { name: 'Create Rider' }));
    return await screen.findByRole('form', { name: 'Create a Rider account' });
  }

  it('checks the fields in the browser, focuses the first problem and sends nothing', async () => {
    const { api, actor } = setup();
    const form = await openForm(actor);
    await actor.click(within(form).getByRole('button', { name: 'Create Rider' }));
    expect(within(form).getByText('Enter a username.')).toBeInTheDocument();
    expect(within(form).getByText('Enter the Rider’s name.')).toBeInTheDocument();
    expect(within(form).getByText('Enter an initial password.')).toBeInTheDocument();
    await waitFor(() => expect(within(form).getByLabelText('Username')).toHaveFocus());
    expect(api.createRider).not.toHaveBeenCalled();
  });

  it('creates the Rider, clears the password, closes, refreshes and confirms without echoing the password', async () => {
    const { api, actor } = setup();
    const form = await openForm(actor);
    await actor.type(within(form).getByLabelText('Username'), 'Rider.New');
    await actor.type(within(form).getByLabelText('Display name'), 'New Rider');
    await actor.type(within(form).getByLabelText('Initial password'), 'first-secret-12345');
    await actor.click(within(form).getByRole('button', { name: 'Create Rider' }));
    await waitFor(() => expect(api.createRider).toHaveBeenCalledWith({ username: 'Rider.New', displayName: 'New Rider', initialPassword: 'first-secret-12345' }));
    expect(await screen.findByText(/Rider account created for New Rider \(rider.new\)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toContain('first-secret-12345');
  });

  it('shows a taken username on its field and keeps the other values', async () => {
    const { actor } = setup({ createRider: vi.fn(async () => { throw new ApiFailure(409, 'USERNAME_TAKEN'); }) });
    const form = await openForm(actor);
    await actor.type(within(form).getByLabelText('Username'), 'seller.a');
    await actor.type(within(form).getByLabelText('Display name'), 'Someone');
    await actor.type(within(form).getByLabelText('Initial password'), 'first-secret-12345');
    await actor.click(within(form).getByRole('button', { name: 'Create Rider' }));
    expect(await within(form).findByText('That username is taken. Try another.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Username')).toHaveValue('seller.a');
    expect(within(form).getByLabelText('Display name')).toHaveValue('Someone');
    expect(within(form).getByLabelText('Initial password')).toHaveValue('');
    await waitFor(() => expect(within(form).getByLabelText('Username')).toHaveFocus());
  });

  it('shows a server password rule on the password field', async () => {
    const { actor } = setup({ createRider: vi.fn(async () => { throw new ApiFailure(422, 'VALIDATION_ERROR', { initialPassword: 'Choose a less common password.' }); }) });
    const form = await openForm(actor);
    await actor.type(within(form).getByLabelText('Username'), 'rider.new');
    await actor.type(within(form).getByLabelText('Display name'), 'New Rider');
    await actor.type(within(form).getByLabelText('Initial password'), 'password1234');
    await actor.click(within(form).getByRole('button', { name: 'Create Rider' }));
    expect(await within(form).findByText('Choose a less common password.')).toBeInTheDocument();
  });

  it('names the operation while pending and can be cancelled before sending', async () => {
    let finish!: () => void;
    const createRider = vi.fn(() => new Promise<UserSummary>(resolve => { finish = () => resolve(RIDER); }));
    const { actor } = setup({ createRider });
    const form = await openForm(actor);
    await actor.type(within(form).getByLabelText('Username'), 'rider.new');
    await actor.type(within(form).getByLabelText('Display name'), 'New Rider');
    await actor.type(within(form).getByLabelText('Initial password'), 'first-secret-12345');
    await actor.click(within(form).getByRole('button', { name: 'Create Rider' }));
    expect(await within(form).findByRole('button', { name: 'Creating Rider…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes without creating anything when cancelled', async () => {
    const { api, actor } = setup();
    const form = await openForm(actor);
    await actor.click(within(form).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createRider).not.toHaveBeenCalled();
  });
});

describe('M1-PH3-TC13 audit panel (A20)', () => {
  it('loads nothing until opened, then lists events with plain labels, safe details and a failed marker', async () => {
    const { api, actor } = setup();
    await screen.findByRole('list', { name: 'Accounts' });
    expect(api.listAudit).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Show activity' }));
    const list = await screen.findByRole('list', { name: 'Recent activity' });
    expect(within(list).getByText('Account created')).toBeInTheDocument();
    expect(within(list).getByText(/By account 1 · On account 3 · Role: RIDER/)).toBeInTheDocument();
    expect(within(list).getByText('Sign-in failed')).toBeInTheDocument();
    expect(within(list).getByText('Failed')).toBeInTheDocument();
    expect(within(list).getByText(/Reason: bad_password/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide activity' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('filters by event type and pages', async () => {
    const listAudit = vi.fn(async (filters: { page: number }) => ({ items: [event('1')], page: filters.page, pageSize: 20, total: 45 }) as AuditList);
    const { actor } = setup({ listAudit });
    await actor.click(await screen.findByRole('button', { name: 'Show activity' }));
    await screen.findByRole('list', { name: 'Recent activity' });
    await actor.selectOptions(screen.getByLabelText('Event type'), 'LOGIN_FAILED');
    await waitFor(() => expect(listAudit).toHaveBeenLastCalledWith({ eventType: 'LOGIN_FAILED', page: 1 }, expect.any(AbortSignal)));
    await actor.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(listAudit).toHaveBeenLastCalledWith({ eventType: 'LOGIN_FAILED', page: 2 }, expect.any(AbortSignal)));
  });

  it('says so when there are no events, and retries a failed load', async () => {
    const listAudit = vi.fn<AdminUsersApi['listAudit']>().mockRejectedValueOnce(new ApiFailure(500, 'INTERNAL_ERROR')).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { actor } = setup({ listAudit });
    await actor.click(await screen.findByRole('button', { name: 'Show activity' }));
    expect(await screen.findByText('Could not load the activity list.')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Retry activity' }));
    expect(await screen.findByText('No activity has been recorded yet.')).toBeInTheDocument();
  });
});

describe('M1-PH3-TC09 Admin workspace guard and real calls', () => {
  const principal = (role: string) => ({ id: '1', username: 'admin', displayName: 'Admin One', role, mustChangePassword: false });
  function serve(role: string) {
    const calls: { key: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const key = `${init?.method ?? 'GET'} ${String(input).replace('/api/v1', '')}`;
      calls.push({ key, init });
      if (key === 'GET /auth/me') return Response.json(principal(role));
      if (key === 'GET /auth/csrf') return Response.json({ csrfToken: 'csrf-1' });
      if (key.startsWith('GET /admin/users')) return Response.json(page([ADMIN, SELLER]));
      if (key === 'PATCH /admin/users/2/status') return Response.json({ ...SELLER, isActive: false, version: 2 });
      throw new Error('Unexpected request ' + key);
    });
    return { fetcher, calls };
  }

  it('sends a Seller away from the Admin screen without calling any Admin endpoint', async () => {
    const { fetcher, calls } = serve('SELLER');
    render(<SessionProvider fetcher={fetcher}><AdminUsersWorkspace /></SessionProvider>);
    expect(await screen.findByText('This workspace is for Admin accounts.')).toBeInTheDocument();
    expect(calls.map(call => call.key).filter(key => key.includes('/admin/'))).toEqual([]);
  });

  it('calls the real endpoints with the CSRF token and the listed version', async () => {
    const { fetcher, calls } = serve('ADMIN');
    const actor = userEvent.setup();
    render(<SessionProvider fetcher={fetcher}><AdminUsersWorkspace /></SessionProvider>);
    await actor.click(await screen.findByRole('button', { name: 'Disable SELLER.A' }));
    await actor.click(await screen.findByRole('button', { name: 'Disable account' }));
    await waitFor(() => expect(calls.some(call => call.key === 'PATCH /admin/users/2/status')).toBe(true));
    const patch = calls.find(call => call.key === 'PATCH /admin/users/2/status')!;
    expect(new Headers(patch.init?.headers).get('X-CSRF-Token')).toBe('csrf-1');
    expect(JSON.parse(String(patch.init?.body))).toEqual({ isActive: false, expectedVersion: 1 });
    expect(calls.some(call => call.key === 'GET /admin/users?page=1&pageSize=20')).toBe(true);
  });
});
