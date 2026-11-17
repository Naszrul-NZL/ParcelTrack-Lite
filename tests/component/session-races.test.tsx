import { afterEach, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from '@/features/auth/session-provider';

const seller = { id: '7', username: 'seller.a', displayName: 'Seller A', role: 'SELLER', mustChangePassword: false };
const credentials = { username: 'seller.a', password: 'synthetic-password' };
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status });
let session: ReturnType<typeof useSession>;
function Probe() {
  const current = useSession();
  useEffect(() => { session = current; }, [current]);
  return <p>{current.status}:{current.csrfToken}</p>;
}
afterEach(cleanup);

it('keeps a successful sign-in when the earlier session check returns 401', async () => {
  let finishMe!: (value: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith('/auth/me')) return new Promise<Response>(resolve => { finishMe = resolve; });
    if (String(input).endsWith('/auth/csrf')) return Response.json({ csrfToken: 'anonymous-csrf' });
    return Response.json({ ...seller, csrfToken: 'authenticated-csrf' });
  });
  render(<SessionProvider fetcher={fetcher}><Probe /></SessionProvider>);
  await waitFor(() => expect(finishMe).toBeTypeOf('function'));
  await act(async () => { expect(await session.signIn(credentials)).toMatchObject({ ok: true }); });
  await act(async () => finishMe(failure(401, 'UNAUTHENTICATED')));
  expect(screen.getByText('authenticated:authenticated-csrf')).toBeInTheDocument();
});

it('ignores a delayed CSRF 401 from a session check that preceded sign-in', async () => {
  let finishCsrf!: (value: Response) => void;
  let csrfReads = 0;
  const fetcher = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith('/auth/me')) return Response.json(seller);
    if (String(input).endsWith('/auth/csrf')) {
      if (++csrfReads === 1) return new Promise<Response>(resolve => { finishCsrf = resolve; });
      return Response.json({ csrfToken: 'anonymous-csrf' });
    }
    return Response.json({ ...seller, csrfToken: 'authenticated-csrf' });
  });
  render(<SessionProvider fetcher={fetcher}><Probe /></SessionProvider>);
  await waitFor(() => expect(finishCsrf).toBeTypeOf('function'));
  await act(async () => { expect(await session.signIn(credentials)).toMatchObject({ ok: true }); });
  await act(async () => finishCsrf(failure(401, 'UNAUTHENTICATED')));
  expect(screen.getByText('authenticated:authenticated-csrf')).toBeInTheDocument();
});

it('does not continue an earlier session check after sign-out', async () => {
  let finishMe!: (value: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith('/auth/me')) return new Promise<Response>(resolve => { finishMe = resolve; });
    if (String(input).endsWith('/auth/csrf')) return Response.json({ csrfToken: 'csrf' });
    return new Response(null, { status: 204 });
  });
  render(<SessionProvider fetcher={fetcher}><Probe /></SessionProvider>);
  await waitFor(() => expect(finishMe).toBeTypeOf('function'));
  await act(async () => { expect(await session.signOut()).toBe(true); });
  const csrfReads = fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/csrf')).length;
  await act(async () => finishMe(Response.json(seller)));
  expect(session.status).toBe('anonymous');
  expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/csrf'))).toHaveLength(csrfReads);
});

it('refreshes stale CSRF only on the next explicit sign-out attempt', async () => {
  let csrfReads = 0;
  const sentTokens: (string | null)[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).endsWith('/auth/me')) return Response.json(seller);
    if (String(input).endsWith('/auth/csrf')) return Response.json({ csrfToken: ++csrfReads === 1 ? 'old-csrf' : 'new-csrf' });
    const token = new Headers(init?.headers).get('X-CSRF-Token');
    sentTokens.push(token);
    return token === 'new-csrf' ? new Response(null, { status: 204 }) : failure(403, 'CSRF_INVALID');
  });
  render(<SessionProvider fetcher={fetcher}><Probe /></SessionProvider>);
  await screen.findByText('authenticated:old-csrf');
  await act(async () => { expect(await session.signOut()).toBe(false); });
  expect(sentTokens).toEqual(['old-csrf']);
  expect(csrfReads).toBe(1);
  expect(session.status).toBe('authenticated');
  expect(session.csrfToken).toBeNull();
  await act(async () => { expect(await session.signOut()).toBe(true); });
  expect(sentTokens).toEqual(['old-csrf', 'new-csrf']);
  expect(session.status).toBe('anonymous');
});

it('preserves identity when refreshing sign-out CSRF fails and permits another explicit attempt', async () => {
  let csrfReads = 0;
  let logouts = 0;
  const fetcher = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith('/auth/me')) return Response.json(seller);
    if (String(input).endsWith('/auth/csrf')) {
      if (++csrfReads === 2) return failure(503, 'BUSY');
      return Response.json({ csrfToken: csrfReads === 1 ? 'old-csrf' : 'new-csrf' });
    }
    return ++logouts === 1 ? failure(403, 'CSRF_INVALID') : new Response(null, { status: 204 });
  });
  render(<SessionProvider fetcher={fetcher}><Probe /></SessionProvider>);
  await screen.findByText('authenticated:old-csrf');
  await act(async () => { expect(await session.signOut()).toBe(false); });
  await act(async () => { expect(await session.signOut()).toBe(false); });
  expect(session.status).toBe('authenticated');
  expect(session.csrfToken).toBeNull();
  expect(logouts).toBe(1);
  await act(async () => { expect(await session.signOut()).toBe(true); });
  expect(logouts).toBe(2);
  expect(session.status).toBe('anonymous');
});
