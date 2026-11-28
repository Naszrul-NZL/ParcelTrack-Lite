import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionProvider } from '@/features/auth/session-provider';
import { ParcelDetailPage, type ParcelDetailSlots } from '@/features/parcels/parcel-detail-page';
import { SEARCH_DEBOUNCE_MS, SellerParcelListPage } from '@/features/parcels/seller-parcel-list-page';
import type { ParcelSlotProps } from '@/shared/types/parcel-slots';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const principals = {
  SELLER: { id: '7', username: 'seller.a', displayName: 'Seller A', role: 'SELLER', mustChangePassword: false },
  RIDER: { id: '21', username: 'rider.a', displayName: 'Rider A', role: 'RIDER', mustChangePassword: false },
  OTHER_RIDER: { id: '22', username: 'rider.b', displayName: 'Rider B', role: 'RIDER', mustChangePassword: false },
  ADMIN: { id: '1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false },
} as const;
type Who = keyof typeof principals;

const token = (digit: string) => 'PTL-' + digit.repeat(32);
const summary = (id: string, digit: string, status = 'REGISTERED') =>
  ({ id, trackingNumber: token(digit), currentStatus: status, weightKg: '1.250', createdAt: '2026-01-01T00:00:00.000Z', version: 1 });
const listOf = (items: ReturnType<typeof summary>[], total = items.length, page = 1) => Response.json({ page, pageSize: 20, total, items });

function detail(status: string, options: { rider?: string | null; hasProof?: boolean; anonymized?: boolean } = {}) {
  const rider = options.rider === undefined ? '21' : options.rider;
  return {
    ...summary('12', 'A', status),
    recipient: options.anonymized ? { name: null, phone: null, address: null } : { name: 'Synthetic Recipient', phone: '+60123456789', address: 'Synthetic address' },
    assignedRider: rider ? { id: rider, displayName: 'Rider A', isActive: true } : null,
    history: [{ status, changedAt: '2026-01-01T00:00:00.000Z' }],
    hasProof: !!options.hasProof, anonymized: !!options.anonymized,
    terminalAt: ['DELIVERED', 'FAILED'].includes(status) ? '2026-01-01T00:00:00.000Z' : null,
  };
}

function session(who: Who, serve: (path: string) => Promise<Response> | Response) {
  return vi.fn<typeof fetch>(path => {
    const url = String(path);
    if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(principals[who]));
    if (url.endsWith('/auth/csrf')) return Promise.resolve(Response.json({ csrfToken: 'fixture-csrf' }));
    return Promise.resolve(serve(url));
  });
}
const listCalls = (fetcher: ReturnType<typeof session>) => fetcher.mock.calls.map(([path]) => String(path)).filter(path => path.includes('/seller/parcels'));
const query = (path: string) => Object.fromEntries(new URL(path, 'http://local').searchParams);

/** Slot doubles: they render the props they receive and can ask the page to refetch. */
const seen: Record<string, ParcelSlotProps[]> = {};
const double = (name: string) => function Double(props: ParcelSlotProps) {
  (seen[name] ??= []).push(props);
  return <section aria-label={name + ' double'}><button type="button" onClick={props.onChanged}>{name} changed</button></section>;
};
const slots: ParcelDetailSlots = { RiderActionPanel: double('RiderActionPanel'), ProofViewer: double('ProofViewer') };

it('M2-PH3-TC11 debounces search, resets to page 1 on any filter change, and keeps search text out of the URL', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetcher = session('SELLER', path => query(path).q === 'nobody'
    ? listOf([])
    : listOf([summary('12', 'A'), summary('13', 'B')], 45, Number(query(path).page)));
  render(<SessionProvider fetcher={fetcher}><SellerParcelListPage /></SessionProvider>);
  expect(await screen.findByText('45 parcels')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 3')).toBeVisible();

  const search = screen.getByLabelText('Search');
  fireEvent.change(search, { target: { value: 'S' } });
  fireEvent.change(search, { target: { value: 'Syn' } });
  fireEvent.change(search, { target: { value: '  Synthetic  ' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50); });
  expect(listCalls(fetcher).some(path => 'q' in query(path))).toBe(false);
  await act(async () => { vi.advanceTimersByTime(60); });
  expect(await screen.findByText('45 parcels match')).toBeVisible();
  // One request for the settled text, trimmed, on page 1.
  expect(listCalls(fetcher).filter(path => 'q' in query(path)).map(query)).toEqual([{ page: '1', q: 'Synthetic' }]);
  expect(window.location.href).not.toContain('Synthetic');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 3')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DELIVERED' } });
  expect(await screen.findByText('Page 1 of 3')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'currentStatus' } });
  await screen.findByText('Page 1 of 3');
  expect(query(listCalls(fetcher).at(-1)!)).toEqual({ page: '1', q: 'Synthetic', status: 'DELIVERED', sort: 'currentStatus' });

  fireEvent.change(search, { target: { value: 'nobody' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  expect(await screen.findByRole('heading', { name: 'No parcels match' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByText('45 parcels')).toBeVisible();
  expect(search).toHaveValue('');
  expect(query(listCalls(fetcher).at(-1)!)).toEqual({ page: '1' });
});

it('M2-PH3-TC11 ignores a slow stale search response that arrives after a newer one', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const slow = Promise.withResolvers<Response>();
  const fetcher = session('SELLER', path => {
    const q = query(path).q;
    if (q === 'first') return slow.promise;
    if (q === 'second') return listOf([summary('20', 'C')]);
    return listOf([summary('12', 'A')]);
  });
  render(<SessionProvider fetcher={fetcher}><SellerParcelListPage /></SessionProvider>);
  await screen.findByText('1 parcel');
  const search = screen.getByLabelText('Search');
  fireEvent.change(search, { target: { value: 'first' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  fireEvent.change(search, { target: { value: 'second' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  expect(await screen.findByRole('link', { name: new RegExp(token('C')) })).toBeVisible();
  await act(async () => { slow.resolve(listOf([summary('99', 'D')])); });
  expect(screen.getByRole('link', { name: new RegExp(token('C')) })).toBeVisible();
  expect(screen.queryByRole('link', { name: new RegExp(token('D')) })).toBeNull();
});

it('M2-PH3-TC11 shows loading, not the previous records, while a changed query is pending', async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = session('SELLER', path => query(path).status ? pending.promise : listOf([summary('12', 'A')]));
  render(<SessionProvider fetcher={fetcher}><SellerParcelListPage /></SessionProvider>);
  await screen.findByRole('link', { name: new RegExp(token('A')) });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DELIVERED' } });
  expect(screen.getByText('Loading parcels…')).toBeVisible();
  expect(screen.queryByRole('link', { name: new RegExp(token('A')) })).toBeNull();
  await act(async () => { pending.resolve(listOf([summary('20', 'C', 'DELIVERED')])); });
  expect(await screen.findByRole('link', { name: new RegExp(token('C')) })).toBeVisible();
});

it('M2-PH3-TC11 validates search length locally and explains 422 and 429 answers', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetcher = session('SELLER', path => {
    const q = query(path).q;
    if (q === 'busy') return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': '9' } });
    if (q === 'odd') return Response.json({ error: { code: 'VALIDATION_ERROR', fieldErrors: { q: 'x' } } }, { status: 422 });
    return listOf([summary('12', 'A')]);
  });
  render(<SessionProvider fetcher={fetcher}><SellerParcelListPage /></SessionProvider>);
  await screen.findByText('1 parcel');
  const search = screen.getByLabelText('Search');
  fireEvent.change(search, { target: { value: 'x'.repeat(65) } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  expect(screen.getByText('Use 64 characters or fewer.')).toHaveAttribute('role', 'alert');
  expect(listCalls(fetcher).some(path => (query(path).q ?? '').length > 64)).toBe(false);

  fireEvent.change(search, { target: { value: 'odd' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  expect(await screen.findByText('Use 1 to 64 characters.')).toBeVisible();
  fireEvent.change(search, { target: { value: 'busy' } });
  await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
  expect(await screen.findByText('Too many requests.')).toBeVisible();
  expect(screen.getByText('Try again in 9 seconds.')).toBeVisible();
});

it('M2-PH3-TC11 renders each slot only for the viewer and status that allow it', async () => {
  const cases: [Who, ReturnType<typeof detail>, boolean, boolean][] = [
    ['RIDER', detail('ASSIGNED'), true, false],
    ['RIDER', detail('OUT_FOR_DELIVERY'), true, false],
    ['RIDER', detail('DELIVERED', { hasProof: true }), false, true],
    ['RIDER', detail('FAILED', { hasProof: true }), false, true],
    ['OTHER_RIDER', detail('ASSIGNED'), false, false],
    ['SELLER', detail('OUT_FOR_DELIVERY'), false, false],
    ['SELLER', detail('DELIVERED', { hasProof: true }), false, true],
    ['ADMIN', detail('ASSIGNED'), false, false],
    ['ADMIN', detail('DELIVERED', { hasProof: true }), false, true],
    ['SELLER', detail('REGISTERED', { rider: null }), false, false],
    ['SELLER', detail('DELIVERED', { hasProof: true, anonymized: true }), false, false],
  ];
  for (const [who, parcel, rider, proof] of cases) {
    const label = `${who} ${parcel.currentStatus}${parcel.hasProof ? ' proof' : ''}${parcel.anonymized ? ' anonymized' : ''}`;
    render(<SessionProvider fetcher={session(who, () => Response.json(parcel))}><ParcelDetailPage parcelId="12" slots={slots} /></SessionProvider>);
    await screen.findByRole('heading', { name: 'Delivery details' });
    expect(!!screen.queryByRole('region', { name: 'RiderActionPanel double' }), label).toBe(rider);
    expect(!!screen.queryByRole('region', { name: 'ProofViewer double' }), label).toBe(proof);
    cleanup();
  }
  // The slot receives the A12 detail exactly as served.
  expect(seen.RiderActionPanel[0].parcel).toEqual(detail('ASSIGNED'));
});

it('M2-PH3-TC11 refetches A12 when a slot reports a change', async () => {
  const answers = [detail('ASSIGNED'), detail('OUT_FOR_DELIVERY')];
  const fetcher = session('RIDER', () => Response.json(answers.length > 1 ? answers.shift() : answers[0]));
  render(<SessionProvider fetcher={fetcher}><ParcelDetailPage parcelId="12" slots={slots} /></SessionProvider>);
  const docket = await screen.findByRole('article', { name: 'parcel docket ' + token('A') });
  expect(within(docket).getAllByText('Assigned').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'RiderActionPanel changed' }));
  expect(await within(await screen.findByRole('article', { name: 'parcel docket ' + token('A') })).findAllByText('Out for delivery')).not.toHaveLength(0);
  expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith('/parcels/12'))).toHaveLength(2);
});

it('M2-PH3-TC11 shows the anonymized state, and handles 404, 422 and 429 answers', async () => {
  render(<SessionProvider fetcher={session('SELLER', () => Response.json(detail('DELIVERED', { anonymized: true })))}><ParcelDetailPage parcelId="12" slots={slots} /></SessionProvider>);
  expect(await screen.findByText(/Recipient details were removed under the 12-month retention rule/)).toBeVisible();
  expect(screen.getAllByText('Removed')).toHaveLength(3);
  expect(screen.queryByText('Synthetic Recipient')).toBeNull();
  cleanup();

  for (const [status, heading] of [[404, 'Parcel not found'], [422, 'Parcel not found']] as const) {
    render(<SessionProvider fetcher={session('SELLER', () => Response.json({ error: { code: 'NOT_FOUND' } }, { status }))}><ParcelDetailPage parcelId="12" /></SessionProvider>);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    cleanup();
  }
  const answers = [Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': '30' } }), Response.json(detail('REGISTERED', { rider: null }))];
  render(<SessionProvider fetcher={session('SELLER', () => answers.shift()!)}><ParcelDetailPage parcelId="12" /></SessionProvider>);
  expect(await screen.findByText('Try again in 30 seconds.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Delivery details' })).toBeVisible();
});
