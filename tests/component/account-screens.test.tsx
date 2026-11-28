import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/register' }));

import { ChangePasswordPage } from '@/features/auth/change-password-page';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { SessionProvider } from '@/features/auth/session-provider';

const seller = { id: '7', username: 'seller.a', displayName: 'Seller A', role: 'SELLER', mustChangePassword: false };
const failure = (status: number, code: string, fieldErrors?: Record<string, string>, headers: Record<string, string> = {}) =>
  Response.json({ error: { code, message: 'x', ...(fieldErrors ? { fieldErrors } : {}) }, requestId: 'r' }, { status, headers });

type Route = (init?: RequestInit) => Response | Promise<Response>;
function server(routes: Record<string, Route | Route[]>) {
  const calls: { key: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input).replace('/api/v1', '')}`;
    calls.push({ key, init });
    const route = routes[key];
    if (!route) throw new Error('Unexpected request ' + key);
    const handler = Array.isArray(route) ? (route.length > 1 ? route.shift()! : route[0]) : route;
    return handler(init);
  });
  return { fetcher, calls };
}
const anonymousVisitor = { 'GET /auth/me': () => failure(401, 'UNAUTHENTICATED'), 'GET /auth/csrf': () => Response.json({ csrfToken: 'csrf-1' }) };
const signedIn = (principal = seller) => ({ 'GET /auth/me': () => Response.json(principal), 'GET /auth/csrf': () => Response.json({ csrfToken: 'csrf-1' }) });
type User = ReturnType<typeof userEvent.setup>;
const PASSWORD = 'a-long-password';

beforeEach(() => { cleanup(); router.replace.mockClear(); router.push.mockClear(); localStorage.clear(); sessionStorage.clear(); });

function setupRegister(routes: Record<string, Route | Route[]>) {
  const api = server({ ...anonymousVisitor, ...routes });
  const user = userEvent.setup();
  render(<SessionProvider fetcher={api.fetcher}><RegisterPage fetcher={api.fetcher} /></SessionProvider>);
  return { ...api, user };
}
async function fillRegister(user: User, options: { username?: string; displayName?: string; password?: string; confirm?: string } = {}) {
  const { username = 'new.seller', displayName = 'New Seller', password = PASSWORD } = options;
  const confirm = options.confirm ?? password;
  if (username) await user.type(screen.getByLabelText('Username'), username);
  if (displayName) await user.type(screen.getByLabelText('Display name'), displayName);
  if (password) await user.type(screen.getByLabelText('Password', { exact: true }), password);
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm);
}
const submitRegister = (user: User) => user.click(screen.getByRole('button', { name: /^Create account|^Creating account/ }));

describe('M1-PH3-TC14 register screen (A02)', () => {
  it('checks every field in the browser, focuses the first problem and sends nothing', async () => {
    const { user, calls } = setupRegister({});
    await waitFor(() => expect(calls).toHaveLength(1));
    await submitRegister(user);
    expect(screen.getByText('Enter a username.')).toBeInTheDocument();
    expect(screen.getByText('Enter the name to show on your account.')).toBeInTheDocument();
    expect(screen.getByText('Choose a password.')).toBeInTheDocument();
    expect(screen.getByText('Enter the password again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.map(call => call.key)).toEqual(['GET /auth/me']);
  });

  it('explains a bad username, a short password and a mismatched confirmation', async () => {
    const { user, calls } = setupRegister({});
    await fillRegister(user, { username: 'a b', password: 'short', confirm: 'different' });
    await submitRegister(user);
    expect(screen.getByText('Use 3 to 50 letters, numbers, dots, dashes or underscores.', { selector: '[role=alert]' })).toBeInTheDocument();
    expect(screen.getByText('Use 10 to 128 characters.', { selector: '[role=alert]' })).toBeInTheDocument();
    expect(screen.getByText('The two passwords don’t match.')).toBeInTheDocument();
    expect(calls.filter(call => call.key.startsWith('POST'))).toEqual([]);
  });

  it('registers with a CSRF token and no role, clears the passwords, never signs in, and goes to sign in with a notice', async () => {
    const { user, calls } = setupRegister({ 'POST /auth/register': () => Response.json({ ...seller, username: 'new.seller', mustChangePassword: false }, { status: 201 }) });
    await fillRegister(user, { username: ' New.Seller ' });
    await submitRegister(user);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login?notice=registered'));
    const post = calls.find(call => call.key === 'POST /auth/register')!;
    expect(new Headers(post.init?.headers).get('X-CSRF-Token')).toBe('csrf-1');
    expect(JSON.parse(String(post.init?.body))).toEqual({ username: 'New.Seller', displayName: 'New Seller', password: PASSWORD });
    expect(calls.map(call => call.key)).not.toContain('POST /auth/login');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('names the operation and disables the form while pending', async () => {
    let finish!: (response: Response) => void;
    const { user } = setupRegister({ 'POST /auth/register': () => new Promise<Response>(resolve => { finish = resolve; }) });
    await fillRegister(user);
    await submitRegister(user);
    const pending = await screen.findByRole('button', { name: 'Creating account…' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('form', { name: 'Create a Seller account' })).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish(failure(409, 'USERNAME_TAKEN')));
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('puts a taken username on the username field, keeps what was typed and focuses it', async () => {
    const { user } = setupRegister({ 'POST /auth/register': () => failure(409, 'USERNAME_TAKEN') });
    await fillRegister(user);
    await submitRegister(user);
    expect(await screen.findByText('That username is taken. Try another.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('new.seller');
    expect(screen.getByLabelText('Display name')).toHaveValue('New Seller');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus());
  });

  it('shows a server password rule on the password field', async () => {
    const { user } = setupRegister({ 'POST /auth/register': () => failure(422, 'VALIDATION_ERROR', { password: 'Choose a less common password.' }) });
    await fillRegister(user);
    await submitRegister(user);
    expect(await screen.findByText('Choose a less common password.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus());
  });

  it.each([
    ['rate limit', () => failure(429, 'RATE_LIMITED', undefined, { 'Retry-After': '1800' }), 'Too many sign-ups from this network.', 'Try again in 30 minutes.'],
    ['busy', () => failure(503, 'BUSY'), 'Registration is busy right now.', 'Wait a moment, then try again.'],
    ['network failure', () => { throw new TypeError('network'); }, 'We couldn’t create your account.', 'Check your connection, then try again.'],
  ] as [string, Route, string, string][])('explains a %s failure without losing the names', async (_name, route, title, detail) => {
    const { user } = setupRegister({ 'POST /auth/register': route });
    await fillRegister(user);
    await submitRegister(user);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('new.seller');
  });

  it('drops a stale CSRF token after a timeout and asks for a new one on the next submit', async () => {
    const { user, calls } = setupRegister({
      'POST /auth/register': [() => failure(403, 'CSRF_INVALID'), () => Response.json(seller, { status: 201 })],
    });
    await fillRegister(user);
    await submitRegister(user);
    expect(await screen.findByText('This page timed out.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password', { exact: true }), PASSWORD);
    await user.type(screen.getByLabelText('Confirm password'), PASSWORD);
    await submitRegister(user);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login?notice=registered'));
    expect(calls.filter(call => call.key === 'GET /auth/csrf')).toHaveLength(2);
  });

  it('never creates a session just by viewing the page, and lets the person reveal a password', async () => {
    const { user, calls } = setupRegister({});
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls.map(call => call.key)).toEqual(['GET /auth/me']);
    await user.type(screen.getByLabelText('Password', { exact: true }), PASSWORD);
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends a signed-in person to their workspace instead of the form', async () => {
    const api = server(signedIn());
    render(<SessionProvider fetcher={api.fetcher}><RegisterPage fetcher={api.fetcher} /></SessionProvider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/seller/parcels'));
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });
});

function setupPassword(principal = seller, routes: Record<string, Route | Route[]> = {}) {
  const api = server({ ...signedIn(principal), ...routes });
  const user = userEvent.setup();
  render(<SessionProvider fetcher={api.fetcher}><ChangePasswordPage /></SessionProvider>);
  return { ...api, user };
}
async function fillPassword(user: User, options: { current?: string; next?: string; confirm?: string } = {}) {
  const { current = 'old-password-1', next = 'brand-new-password' } = options;
  const confirm = options.confirm ?? next;
  await user.type(await screen.findByLabelText('Current password'), current);
  if (next) await user.type(screen.getByLabelText('New password'), next);
  if (confirm) await user.type(screen.getByLabelText('Confirm new password'), confirm);
}
const submitPassword = (user: User) => user.click(screen.getByRole('button', { name: /^Change password|^Changing password/ }));

describe('M1-PH3-TC14 change-password screen (A06)', () => {
  it('checks the fields in the browser and sends nothing', async () => {
    const { user, calls } = setupPassword();
    await screen.findByLabelText('Current password');
    await submitPassword(user);
    expect(screen.getByText('Enter your current password.')).toBeInTheDocument();
    expect(screen.getByText('Choose a new password.')).toBeInTheDocument();
    expect(screen.getByText('Enter the new password again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveFocus();
    expect(calls.filter(call => call.key.startsWith('POST'))).toEqual([]);
  });

  it('refuses a new password equal to the current one and a mismatched confirmation', async () => {
    const { user } = setupPassword();
    await fillPassword(user, { current: 'same-password-1', next: 'same-password-1', confirm: 'other-password-2' });
    await submitPassword(user);
    expect(screen.getByText('Choose a password you haven’t used here.')).toBeInTheDocument();
    expect(screen.getByText('The two passwords don’t match.')).toBeInTheDocument();
  });

  it('changes the password with the CSRF token, ends the identity, and goes to sign in with a notice', async () => {
    const { user, calls } = setupPassword(seller, { 'POST /auth/password': () => new Response(null, { status: 204 }) });
    await fillPassword(user);
    await submitPassword(user);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login?notice=password-changed'));
    const post = calls.find(call => call.key === 'POST /auth/password')!;
    expect(new Headers(post.init?.headers).get('X-CSRF-Token')).toBe('csrf-1');
    expect(JSON.parse(String(post.init?.body))).toEqual({ currentPassword: 'old-password-1', newPassword: 'brand-new-password' });
    expect(calls.map(call => call.key)).not.toContain('POST /auth/login');
    // The session is forgotten in the browser, so the guard stops showing the form.
    await waitFor(() => expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument());
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('shows a wrong current password on its own field, clears all three, and focuses it', async () => {
    const { user } = setupPassword(seller, { 'POST /auth/password': () => failure(422, 'CURRENT_PASSWORD_INVALID', { currentPassword: 'x' }) });
    await fillPassword(user);
    await submitPassword(user);
    expect(await screen.findByText('That is not your current password.')).toBeInTheDocument();
    for (const label of ['Current password', 'New password', 'Confirm new password']) expect(screen.getByLabelText(label)).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveFocus());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows a server password rule on the new-password field', async () => {
    const { user } = setupPassword(seller, { 'POST /auth/password': () => failure(422, 'VALIDATION_ERROR', { newPassword: 'Choose a less common password.' }) });
    await fillPassword(user);
    await submitPassword(user);
    expect(await screen.findByText('Choose a less common password.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('New password')).toHaveFocus());
  });

  it.each([
    ['rate limit', () => failure(429, 'RATE_LIMITED', undefined, { 'Retry-After': '600' }), 'Too many wrong passwords.', 'For your safety, try again in 10 minutes.'],
    ['busy', () => failure(503, 'BUSY'), 'Password changes are busy right now.', 'Wait a moment, then try again.'],
    ['timeout', () => failure(403, 'CSRF_INVALID'), 'This page timed out.', 'Reload the page, then enter your passwords again.'],
    ['network failure', () => { throw new TypeError('network'); }, 'We couldn’t change your password.', 'Your password was not changed. Check your connection, then try again.'],
  ] as [string, Route, string, string][])('explains a %s failure and stays on the page', async (_name, route, title, detail) => {
    const { user } = setupPassword(seller, { 'POST /auth/password': route });
    await fillPassword(user);
    await submitPassword(user);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('names the operation and disables the form while pending', async () => {
    let finish!: (response: Response) => void;
    const { user } = setupPassword(seller, { 'POST /auth/password': () => new Promise<Response>(resolve => { finish = resolve; }) });
    await fillPassword(user);
    await submitPassword(user);
    expect(await screen.findByRole('button', { name: 'Changing password…' })).toBeDisabled();
    await act(async () => finish(failure(422, 'CURRENT_PASSWORD_INVALID')));
    expect(await screen.findByRole('button', { name: 'Change password' })).toBeEnabled();
  });

  it('keeps a must-change account here, explains why, and offers no way back to the workspace', async () => {
    setupPassword({ ...seller, mustChangePassword: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.getByText(/An Admin set your current password/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to your workspace' })).not.toBeInTheDocument();
  });

  it('offers a normal account a way back to its workspace', async () => {
    setupPassword();
    expect(await screen.findByRole('heading', { level: 1, name: 'Change your password' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your workspace' })).toHaveAttribute('href', '/seller/parcels');
  });

  it('sends a visitor who is not signed in to sign in', async () => {
    const api = server(anonymousVisitor);
    render(<SessionProvider fetcher={api.fetcher}><ChangePasswordPage /></SessionProvider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });
});

describe('M1-PH3-TC14 sign-in connections to the account screens', () => {
  it('shows the registered and password-changed notices, and links to registration', async () => {
    for (const [notice, title] of [['registered', 'Your account is ready.'], ['password-changed', 'Your password was changed.']] as const) {
      cleanup();
      const api = server(anonymousVisitor);
      render(<SessionProvider fetcher={api.fetcher}><LoginPage initialWorkspace="seller" notice={notice} /></SessionProvider>);
      expect(await screen.findByText(title)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  it('sends an account that must change its password straight to the change screen after sign-in', async () => {
    const api = server({ ...anonymousVisitor, 'POST /auth/login': () => Response.json({ ...seller, role: 'RIDER', mustChangePassword: true, csrfToken: 'csrf-2' }) });
    const user = userEvent.setup();
    render(<SessionProvider fetcher={api.fetcher}><LoginPage initialWorkspace="rider" /></SessionProvider>);
    await user.type(await screen.findByLabelText('Username'), 'rider.new');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/password'));
  });
});

describe('M1-PH3-T09 shell session handling', () => {
  const guardedRoutes = (principal: typeof seller, extra: Record<string, Route | Route[]> = {}) => server({ ...signedIn(principal), ...extra });

  it('says the session ended, on the sign-in page, when the server ends a signed-in session (401 on a later call)', async () => {
    const { RouteGuard } = await import('@/features/auth/route-guard');
    const { useSession } = await import('@/features/auth/session-provider');
    function Screen() {
      const session = useSession();
      return <button onClick={() => void session.request('/seller/parcels').catch(() => undefined)}>Load parcels</button>;
    }
    const api = guardedRoutes(seller, { 'GET /seller/parcels': () => failure(401, 'UNAUTHENTICATED') });
    const actor = userEvent.setup();
    render(<SessionProvider fetcher={api.fetcher}><RouteGuard><Screen /></RouteGuard></SessionProvider>);
    await actor.click(await screen.findByRole('button', { name: 'Load parcels' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login?notice=expired'));
  });

  it('does not call a deliberate sign-out an expired session', async () => {
    const { RouteGuard } = await import('@/features/auth/route-guard');
    const { AppNavigation } = await import('@/components/app-navigation');
    const api = guardedRoutes(seller, { 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    const actor = userEvent.setup();
    render(<SessionProvider fetcher={api.fetcher}><AppNavigation /><RouteGuard><p>Private</p></RouteGuard></SessionProvider>);
    await actor.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(router.replace).not.toHaveBeenCalledWith('/login?notice=expired');
  });

  it('shows the expiry notice on the sign-in page', async () => {
    const api = server(anonymousVisitor);
    render(<SessionProvider fetcher={api.fetcher}><LoginPage initialWorkspace="seller" notice="expired" /></SessionProvider>);
    expect(await screen.findByText('Your session ended.')).toBeInTheDocument();
    expect(screen.getByText(/Sign in again to continue/)).toBeInTheDocument();
  });

  it('sends a must-change account from any private screen to the password screen and trims its navigation', async () => {
    const { RouteGuard } = await import('@/features/auth/route-guard');
    const { AppNavigation } = await import('@/components/app-navigation');
    const api = guardedRoutes({ ...seller, role: 'ADMIN', mustChangePassword: true });
    render(<SessionProvider fetcher={api.fetcher}><AppNavigation /><RouteGuard role="ADMIN"><p>Admin only</p></RouteGuard></SessionProvider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/password'));
    expect(screen.queryByText('Admin only')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Track a parcel', 'Change password']);
    expect(within(nav).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('shows a normal Admin the workspace, Accounts and Password links', async () => {
    const { AppNavigation } = await import('@/components/app-navigation');
    const api = guardedRoutes({ ...seller, role: 'ADMIN' });
    render(<SessionProvider fetcher={api.fetcher}><AppNavigation /></SessionProvider>);
    await screen.findByRole('button', { name: 'Sign out' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Track a parcel', 'Your workspace', 'Accounts', 'Password']);
  });

  it('clears private screens when a different person signs in, so nothing carries over', async () => {
    const { RouteGuard } = await import('@/features/auth/route-guard');
    const { useSession } = await import('@/features/auth/session-provider');
    function Private() {
      const session = useSession();
      return <p>Private for {session.principal?.username}</p>;
    }
    function Switch() {
      const session = useSession();
      return <button onClick={() => void session.signIn({ username: 'rider.a', password: PASSWORD })}>Switch</button>;
    }
    const api = guardedRoutes(seller, { 'POST /auth/login': () => Response.json({ ...seller, id: '9', username: 'rider.a', role: 'RIDER', csrfToken: 'csrf-2' }) });
    const actor = userEvent.setup();
    render(<SessionProvider fetcher={api.fetcher}><Switch /><RouteGuard><Private /></RouteGuard></SessionProvider>);
    expect(await screen.findByText('Private for seller.a')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Switch' }));
    expect(await screen.findByText('Private for rider.a')).toBeInTheDocument();
    expect(screen.queryByText('Private for seller.a')).not.toBeInTheDocument();
  });
});
