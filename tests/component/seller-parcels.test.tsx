import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { ParcelDetailPage } from '@/features/parcels/parcel-detail-page';
import { RegisterParcelPage } from '@/features/parcels/register-parcel-page';
import { SellerParcelListPage } from '@/features/parcels/seller-parcel-list-page';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
afterEach(cleanup);
const seller = { id: '7', username: 'seller.a', displayName: 'Seller A', role: 'SELLER', mustChangePassword: false };
const other = { ...seller, id: '8', username: 'seller.b', displayName: 'Seller B' };
const number = 'PTL-' + 'A7'.repeat(16);
const summary = { id: '12', trackingNumber: number, currentStatus: 'REGISTERED', weightKg: '1.250', createdAt: '2026-01-01T00:00:00.000Z', version: 1 };
const detail = {
  ...summary, recipient: { name: '<script>parcel note</script>', phone: '+60123456789', address: 'Synthetic address' },
  assignedRider: null, history: [{ status: summary.currentStatus, changedAt: summary.createdAt }],
  hasProof: false, anonymized: false, terminalAt: null,
};
let session: ReturnType<typeof useSession>;
function Probe() {
  const value = useSession();
  useEffect(() => { session = value; }, [value]);
  return null;
}
function authenticated(serve: typeof fetch) {
  return vi.fn<typeof fetch>((path, init) => {
    if (String(path).endsWith('/auth/me')) return Promise.resolve(Response.json(seller));
    if (String(path).endsWith('/auth/csrf')) return Promise.resolve(Response.json({ csrfToken: 'fixture-csrf' }));
    return serve(path, init);
  });
}
const responsePage = (page: number, items: (typeof summary)[], total: number) =>
  Response.json({ page, pageSize: 20, total, items });

it('shows local and server field errors, sends once while pending, and keeps the request ID on retry', async () => {
  const submitted: RequestInit[] = [];
  let answer!: (value: Response) => void;
  const fetcher = authenticated(async (_path, init) => {
    submitted.push(init!);
    if (submitted.length === 1) return new Promise(resolve => { answer = resolve; });
    return Response.json(detail, { status: 201 });
  });
  render(<SessionProvider fetcher={fetcher}><RegisterParcelPage /></SessionProvider>);
  const submit = await screen.findByRole('button', { name: 'Register parcel' });
  fireEvent.click(submit);
  expect(screen.getByText('Enter a recipient name with up to 120 characters.')).toBeVisible();
  expect(submitted).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Recipient name'), { target: { value: 'Synthetic' } });
  fireEvent.change(screen.getByLabelText('Recipient phone'), { target: { value: '0123456789' } });
  fireEvent.change(screen.getByLabelText('Delivery address'), { target: { value: 'Synthetic address' } });
  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '1.25' } });
  fireEvent.click(submit);
  fireEvent.submit(submit.closest('form')!);
  expect(submit).toBeDisabled();
  expect(submitted).toHaveLength(1);
  await act(async () => answer(Response.json({ error: { code: 'VALIDATION_ERROR', fieldErrors: { weightKg: 'Server rejected this weight.' } } }, { status: 422 })));
  expect(await screen.findByText(/Enter a weight from/)).toBeVisible();
  fireEvent.click(submit);
  const receipt = await screen.findByRole('heading', { name: 'Parcel registered' });
  expect(receipt).toHaveFocus();
  expect(screen.getByRole('heading', { name: number })).toBeVisible();
  expect(screen.getByRole('link', { name: 'View parcel details' })).toHaveAttribute('href', '/parcels/12');
  expect(submitted).toHaveLength(2);
  expect(JSON.parse(String(submitted[1].body)).clientRequestId).toBe(JSON.parse(String(submitted[0].body)).clientRequestId);
  expect(new Headers(submitted[0].headers).get('X-CSRF-Token')).toBe('fixture-csrf');
});

it('loads and retries the parcel list, pages it, and clears old records on identity change', async () => {
  let requests = 0;
  let finish!: (value: Response) => void;
  const fetcher = authenticated(async path => {
    if (String(path).endsWith('/auth/login')) return Response.json({ ...other, csrfToken: 'other-csrf' });
    requests++;
    if (requests === 1) return new Promise(resolve => { finish = resolve; });
    if (requests === 2) return responsePage(1, [summary], 21);
    if (requests === 3) return responsePage(2, [{ ...summary, id: '13' }], 21);
    return responsePage(1, [], 0);
  });
  render(<SessionProvider fetcher={fetcher}><SellerParcelListPage /><Probe /></SessionProvider>);
  expect(await screen.findByText('Loading parcels…')).toBeVisible();
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => finish(new Response(null, { status: 503 })));
  expect(await screen.findByText('Couldn’t load your parcels.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: new RegExp(number) })).toHaveAttribute('href', '/parcels/12');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 2')).toBeVisible();
  expect(screen.getByRole('link', { name: new RegExp(number) })).toHaveAttribute('href', '/parcels/13');
  await act(async () => { await session.signIn({ username: 'seller.b', password: 'synthetic' }); });
  expect(await screen.findByText('No parcels yet')).toBeVisible();
  expect(screen.queryByText(number)).not.toBeInTheDocument();
});

it('renders recipient data as literal text and shows the same not-found view for an inaccessible record', async () => {
  const fetcher = authenticated(async path => String(path).endsWith('/12')
    ? Response.json(detail) : Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }));
  const view = render(<SessionProvider fetcher={fetcher}><ParcelDetailPage parcelId="12" /></SessionProvider>);
  expect(await screen.findByText(detail.recipient.name)).toBeVisible();
  expect(view.container.querySelector('script')).toBeNull();
  view.rerender(<SessionProvider fetcher={fetcher}><ParcelDetailPage parcelId="13" /></SessionProvider>);
  expect(await screen.findByRole('heading', { name: 'Parcel not found' })).toBeVisible();
  expect(screen.queryByText(detail.recipient.name)).not.toBeInTheDocument();
});
