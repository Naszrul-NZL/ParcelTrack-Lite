import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/login' }));

import { LoginPage } from '@/features/auth/login-page';
import { RouteGuard } from '@/features/auth/route-guard';
import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { AppNavigation } from '@/components/app-navigation';

const seller = { id: '7', username: 'seller.a', displayName: 'Seller A', role: 'SELLER', mustChangePassword: false };
const failure = (status: number, code: string, headers: Record<string, string> = {}) => Response.json({ error: { code, message: 'x' }, requestId: 'r' }, { status, headers });

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
type User = ReturnType<typeof userEvent.setup>;

function setup(routes: Record<string, Route | Route[]>) {
  const api = server({ ...anonymousVisitor, ...routes });
  const user = userEvent.setup();
  render(<SessionProvider fetcher={api.fetcher}><LoginPage initialWorkspace="seller" /></SessionProvider>);
  return { ...api, user };
}
async function fill(user: User, username = 'seller.a', password = 'a-long-password') {
  if (username) await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
}

beforeEach(() => { cleanup(); router.replace.mockClear(); localStorage.clear(); sessionStorage.clear(); });

describe('M1-PH2-TC14 login form', () => {
  it('shows field errors for empty fields, focuses the first, and sends nothing', async () => {
    const { user, calls } = setup({});
    await waitFor(() => expect(calls).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your username.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();
    await user.type(screen.getByLabelText('Username'), 'seller.a');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(calls.map(call => call.key)).toEqual(['GET /auth/me']);
  });

  it('disables the button and names the operation while pending, then clears only the password', async () => {
    let finish!: (response: Response) => void;
    const { user } = setup({ 'POST /auth/login': () => new Promise<Response>(resolve => { finish = resolve; }) });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('seller.a');
    await act(async () => finish(failure(401, 'AUTH_INVALID')));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows one generic message for 401, clears the password, keeps the username and refocuses the password', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => failure(401, 'AUTH_INVALID') });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect username or password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('seller.a');
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    // The 401 drops the cached CSRF token, so the next attempt asks for it again instead of reusing a stale one.
    await fill(user, '', 'another-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(calls.filter(call => call.key === 'POST /auth/login')).toHaveLength(2));
    expect(calls.filter(call => call.key === 'GET /auth/csrf')).toHaveLength(2);
  });

  it('shows the retry hint from Retry-After for a 429', async () => {
    const { user } = setup({ 'POST /auth/login': () => failure(429, 'RATE_LIMITED', { 'Retry-After': '840' }) });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Too many sign-in attempts.')).toBeInTheDocument();
    expect(screen.getByText('Try again in 14 minutes.')).toBeInTheDocument();
  });

  it('asks the person to try again when the page timed out (CSRF), then uses a fresh token', async () => {
    const { user, calls } = setup({
      'POST /auth/login': [() => failure(403, 'CSRF_INVALID'), () => Response.json({ ...seller, csrfToken: 'csrf-2' })],
    });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('This page timed out.')).toBeInTheDocument();
    await fill(user, '', 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/seller/parcels'));
    expect(calls.filter(call => call.key === 'GET /auth/csrf')).toHaveLength(2);
  });

  it.each([
    ['busy', () => failure(503, 'BUSY'), 'Sign-in is busy right now.'],
    ['invalid input', () => failure(422, 'VALIDATION_ERROR'), 'Those details can’t be used.'],
    ['network failure', () => { throw new TypeError('network'); }, 'We couldn’t reach the server.'],
  ] as [string, Route, string][])('explains a %s failure without losing the username', async (_name, route, title) => {
    const { user } = setup({ 'POST /auth/login': route });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('seller.a');
  });

  it('signs in, goes to the role landing page, sends JSON with the CSRF token, and stores nothing in the browser', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => Response.json({ ...seller, csrfToken: 'csrf-2' }) });
    await fill(user, ' Seller.A ', 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/seller/parcels'));
    const login = calls.find(call => call.key === 'POST /auth/login')!;
    expect(new Headers(login.init?.headers).get('X-CSRF-Token')).toBe('csrf-1');
    expect(JSON.parse(String(login.init?.body))).toEqual({ username: 'Seller.A', password: 'a-long-password' });
    expect(login.init?.credentials).toBe('same-origin');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it.each([['RIDER', '/rider/parcels'], ['ADMIN', '/admin/dashboard']])('sends %s to %s', async (role, path) => {
    const { user } = setup({ 'POST /auth/login': () => Response.json({ ...seller, role, csrfToken: 'c' }) });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(path));
  });

  it('is operable by keyboard: Tab order and Enter to submit', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => failure(401, 'AUTH_INVALID') });
    await user.tab();
    expect(screen.getByLabelText('Username')).toHaveFocus();
    await user.keyboard('seller.a');
    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.keyboard('a-long-password');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(calls.some(call => call.key === 'POST /auth/login')).toBe(true));
  });

  it('redirects a person who is already signed in instead of showing the form', async () => {
    const api = server({ 'GET /auth/me': () => Response.json({ ...seller, role: 'ADMIN' }), 'GET /auth/csrf': () => Response.json({ csrfToken: 'c' }) });
    render(<SessionProvider fetcher={api.fetcher}><LoginPage initialWorkspace="seller" /></SessionProvider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/admin/dashboard'));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});

describe('M1-PH2-T10 route guard, sign-out and identity change', () => {
  const Private = () => { const { principal } = useSession(); return <p>Private for {principal?.username}</p>; };
  const signedIn = (extra: object = {}) => ({ 'GET /auth/me': () => Response.json({ ...seller, ...extra }), 'GET /auth/csrf': () => Response.json({ csrfToken: 'csrf-1' }) });
  function guarded(routes: Record<string, Route | Route[]>, role: 'SELLER' | 'ADMIN' = 'SELLER') {
    const api = server(routes);
    render(<SessionProvider fetcher={api.fetcher}><AppNavigation /><RouteGuard role={role}><Private /></RouteGuard></SessionProvider>);
    return api;
  }

  it('hides private content and redirects to sign in when anonymous', async () => {
    guarded(anonymousVisitor);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(/Private for/)).not.toBeInTheDocument();
  });

  it('shows private content to the matching role', async () => {
    guarded(signedIn());
    expect(await screen.findByText('Private for seller.a')).toBeInTheDocument();
  });

  it('explains a denied role instead of showing the workspace', async () => {
    guarded(signedIn(), 'ADMIN');
    expect(await screen.findByText('This workspace is for Admin accounts.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your workspace' })).toHaveAttribute('href', '/seller/parcels');
    expect(screen.queryByText(/Private for/)).not.toBeInTheDocument();
  });

  it('holds a must-change account on a notice and sends it to the password screen instead of the workspace', async () => {
    guarded(signedIn({ mustChangePassword: true }));
    expect(await screen.findByText('Change your password before you continue.')).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/password'));
    for (const link of screen.getAllByRole('link', { name: 'Change password' })) expect(link).toHaveAttribute('href', '/account/password');
    expect(screen.queryByRole('link', { name: 'Your workspace' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Private for/)).not.toBeInTheDocument();
  });

  it('signs out through the navigation with the CSRF token and returns to sign in', async () => {
    const api = guarded({ ...signedIn(), 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    const logout = api.calls.find(call => call.key === 'POST /auth/logout')!;
    expect(new Headers(logout.init?.headers).get('X-CSRF-Token')).toBe('csrf-1');
    expect(screen.queryByText(/Private for/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('stays signed in and says so when sign-out fails', async () => {
    guarded({ ...signedIn(), 'POST /auth/logout': () => failure(503, 'BUSY') });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Couldn’t sign out. Try again.')).toBeInTheDocument();
    expect(screen.getByText('Private for seller.a')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('asks the server again when a page is restored from the back/forward cache', async () => {
    const me = vi.fn<Route>().mockResolvedValueOnce(Response.json(seller)).mockResolvedValueOnce(Response.json(seller)).mockResolvedValueOnce(failure(401, 'UNAUTHENTICATED'));
    guarded({ 'GET /auth/me': me, 'GET /auth/csrf': () => Response.json({ csrfToken: 'csrf-1' }) });
    expect(await screen.findByText('Private for seller.a')).toBeInTheDocument();
    await act(async () => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(screen.queryByText(/Private for/)).not.toBeInTheDocument());
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('shows the workspace link and hides Sign in once authenticated', async () => {
    guarded(signedIn());
    expect(await screen.findByRole('link', { name: 'Your workspace' })).toHaveAttribute('href', '/seller/parcels');
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('remounts private screens when a different account signs in', async () => {
    let mounts = 0;
    function Counter() { useState(() => { mounts += 1; }); return null; }
    const first = { ...seller, id: '7' };
    const second = { ...seller, id: '8', username: 'seller.b' };
    const me = vi.fn<Route>().mockResolvedValueOnce(Response.json(first)).mockResolvedValueOnce(Response.json(first)).mockResolvedValueOnce(Response.json(second)).mockResolvedValueOnce(Response.json(second));
    const api = server({ 'GET /auth/me': me, 'GET /auth/csrf': () => Response.json({ csrfToken: 'c' }) });
    render(<SessionProvider fetcher={api.fetcher}><RouteGuard role="SELLER"><Counter /></RouteGuard></SessionProvider>);
    await waitFor(() => expect(mounts).toBe(1));
    await act(async () => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(mounts).toBe(2));
  });
});
