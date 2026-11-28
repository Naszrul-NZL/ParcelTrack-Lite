import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TrackPage } from '@/features/parcels/track-page';

afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });

const NUMBER = 'PTL-' + 'C0FFEE'.padEnd(32, '9');
const history = [
  { status: 'REGISTERED', changedAt: '2026-10-21T08:00:00.000Z' },
  { status: 'ASSIGNED', changedAt: '2026-10-21T12:00:00.000Z' },
  { status: 'OUT_FOR_DELIVERY', changedAt: '2026-10-21T16:00:00.000Z' },
];
const field = () => screen.getByLabelText('Tracking number', { exact: true });
const track = (value: string) => {
  fireEvent.change(field(), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Track parcel' }));
};
const errorBody = (status: number, code: string, headers: Record<string, string> = {}) =>
  Promise.resolve(Response.json({ error: { code, message: 'The request could not be completed.' }, requestId: 'r' }, { status, headers }));

it('M2-PH3-TC10 posts the normalized number without a session, and shows Malaysia time', async () => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ history })));
  render(<TrackPage fetcher={fetcher} />);
  track('  ' + NUMBER.toLowerCase() + ' ');
  expect(screen.getByRole('button', { name: 'Finding parcel…' })).toBeDisabled();
  expect(await screen.findByRole('heading', { level: 2, name: 'Out for delivery' })).toBeVisible();

  expect(fetcher).toHaveBeenCalledTimes(1);
  const [path, init] = fetcher.mock.calls[0];
  expect(path).toBe('/api/v1/public/tracking');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  expect(JSON.parse(String(init!.body))).toEqual({ trackingNumber: NUMBER });
  expect(new Headers(init!.headers).has('x-csrf-token')).toBe(false);

  // 2026-10-21T16:00:00Z is midnight on 22 October in Malaysia (UTC+8).
  const docket = screen.getByRole('article', { name: 'parcel docket ' + NUMBER });
  expect(within(docket).getByText('Recorded updates · Malaysia time')).toBeVisible();
  const latest = screen.getByText(/Last recorded update/);
  expect(latest.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-21T16:00:00.000Z');
  expect(latest.textContent).toMatch(/22 Oct 2026.*12:00\s*am/i);
  expect(within(docket).getAllByText(/22 Oct 2026/)).toHaveLength(1);
  expect(within(docket).getByText('Pending')).toBeVisible();

  // Nothing about the lookup is persisted or placed in the address.
  expect(localStorage.length + sessionStorage.length).toBe(0);
  expect(window.location.href).not.toContain(NUMBER);
});

it('M2-PH3-TC10 shows distinct, safe messages for 404, 422, 429, server and network failures, keeping the number', async () => {
  const responses: (() => Promise<Response>)[] = [
    () => errorBody(404, 'NOT_FOUND'),
    () => errorBody(422, 'VALIDATION_ERROR'),
    () => errorBody(429, 'RATE_LIMITED', { 'Retry-After': '17' }),
    () => errorBody(503, 'BUSY'),
    () => Promise.reject(new TypeError('Failed to fetch')),
  ];
  const fetcher = vi.fn<typeof fetch>(() => responses.shift()!());
  render(<TrackPage fetcher={fetcher} />);

  track(NUMBER);
  expect(await screen.findByRole('heading', { name: 'We couldn’t find that parcel.' })).toBeVisible();
  track(NUMBER);
  expect(await screen.findByText('Enter the full number: PTL- followed by 32 letters A to F or digits.')).toHaveAttribute('role', 'alert');
  expect(field()).toHaveAttribute('aria-invalid', 'true');
  track(NUMBER);
  expect(await screen.findByRole('heading', { name: 'Please wait a moment.' })).toBeVisible();
  expect(screen.getByText(/Try again in 17 seconds\./)).toBeVisible();
  track(NUMBER);
  expect(await screen.findByRole('heading', { name: 'Tracking isn’t available right now.' })).toBeVisible();
  track(NUMBER);
  expect(await screen.findByRole('heading', { name: 'We couldn’t reach ParcelTrack.' })).toBeVisible();
  expect(field()).toHaveValue(NUMBER);
  expect(document.body.textContent).not.toMatch(/NOT_FOUND|RATE_LIMITED|BUSY|Failed to fetch/);
});

it('M2-PH3-TC10 validates empty and malformed numbers locally without sending a lookup', async () => {
  const fetcher = vi.fn<typeof fetch>();
  render(<TrackPage fetcher={fetcher} />);
  track('   ');
  expect(await screen.findByText('Enter a tracking number to continue.')).toHaveAttribute('role', 'alert');
  for (const value of ["' OR '1'='1", 'PTL-' + 'A'.repeat(31), 'PTL-DEMO-001']) {
    track(value);
    expect(await screen.findByText(/PTL- followed by 32 letters/)).toBeVisible();
  }
  expect(fetcher).not.toHaveBeenCalled();
  await waitFor(() => expect(document.activeElement).toBe(field()));
});

it('M2-PH3-TC10 still looks up after the page has been open for 30 minutes, and ignores a superseded slow answer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const slow = Promise.withResolvers<Response>();
  const fetcher = vi.fn<typeof fetch>()
    .mockImplementationOnce(() => slow.promise)
    .mockImplementationOnce(() => Promise.resolve(Response.json({ history: [{ status: 'DELIVERED', changedAt: '2026-10-22T01:00:00.000Z' }] })));
  render(<TrackPage fetcher={fetcher} />);
  await act(async () => { vi.advanceTimersByTime(30 * 60 * 1000); });

  track(NUMBER);
  // The first request is still pending; the button is disabled, so submit the form directly for a second lookup.
  fireEvent.submit(field().closest('form')!);
  expect(await screen.findByRole('heading', { level: 2, name: 'Delivered' })).toBeVisible();
  const firstSignal = fetcher.mock.calls[0][1]!.signal!;
  expect(firstSignal.aborted).toBe(true);
  await act(async () => { slow.resolve(Response.json({ history })); });
  expect(screen.getByRole('heading', { level: 2, name: 'Delivered' })).toBeVisible();
  expect(screen.queryByRole('heading', { level: 2, name: 'Out for delivery' })).toBeNull();
});

it('shows a labelled sample journey without any lookup, and FAILED as its own outcome', async () => {
  const fetcher = vi.fn<typeof fetch>();
  render(<TrackPage fetcher={fetcher} initialSample="PTL-DEMO-001" />);
  expect(screen.getByRole('article', { name: 'Sample parcel docket PTL-DEMO-001' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /PTL-DEMO-004/ }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Failed' })).toBeVisible();
  expect(screen.getByRole('button', { name: /PTL-DEMO-004/ })).toHaveAttribute('aria-pressed', 'true');
  expect(fetcher).not.toHaveBeenCalled();
});
