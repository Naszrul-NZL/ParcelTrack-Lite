import { expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiFailure } from '@/shared/api-client';
import { RiderParcelListPage } from '@/features/delivery/rider-parcel-list-page';
import type { RiderList } from '@/features/delivery/rider-contract';

const parcel: RiderList['items'][number] = {
  id: '1', trackingNumber: 'PTL-' + 'A'.repeat(32), createdAt: '2026-01-01T00:00:00.000Z',
  currentStatus: 'ASSIGNED', version: 2, weightKg: '1.250',
};
const assigned: RiderList = { items: [parcel], page: 1, pageSize: 20, total: 1 };
const outForDelivery = {
  ...assigned, items: [{ ...parcel, currentStatus: 'OUT_FOR_DELIVERY' as const, version: 3 }],
};

it('TC08 exposes only Start delivery and refreshes the list after one successful mutation', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  const start = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const load = vi.fn().mockResolvedValueOnce(assigned).mockResolvedValueOnce(outForDelivery);
  render(<RiderParcelListPage loadParcels={load} startDelivery={start} />);
  expect(screen.getByText(/loading parcels/i)).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: parcel.trackingNumber })).toHaveAttribute('href', '/parcels/1');
  await user.click(screen.getByRole('button', { name: /start delivery/i }));
  expect(screen.getByRole('button', { name: /starting delivery/i })).toBeDisabled();
  expect(start).toHaveBeenCalledWith('1', 2);
  await act(async () => finish());
  expect(await screen.findByText('Out for delivery', { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /start delivery/i })).not.toBeInTheDocument();
  expect(screen.getByText('Delivery started.')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
  expect(start).toHaveBeenCalledOnce();
});

it.each([
  [new ApiFailure(409, 'VERSION_CONFLICT'), /the parcel changed/i],
  [new TypeError('Connection lost'), /the result is uncertain/i],
] as const)('TC08 refreshes after a conflicting or uncertain result without resubmitting', async (error, message) => {
  const user = userEvent.setup();
  const start = vi.fn().mockRejectedValueOnce(error);
  const load = vi.fn().mockResolvedValueOnce(assigned).mockResolvedValueOnce(outForDelivery);
  render(<RiderParcelListPage loadParcels={load} startDelivery={start} />);
  await user.click(await screen.findByRole('button', { name: /start delivery/i }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(await screen.findByText('Out for delivery', { exact: true })).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
  expect(start).toHaveBeenCalledOnce();
});

it('TC08 reports a failed list request and retries the read', async () => {
  const user = userEvent.setup();
  const load = vi.fn().mockRejectedValueOnce(new TypeError()).mockResolvedValueOnce({ ...assigned, items: [], total: 0 });
  render(<RiderParcelListPage loadParcels={load} startDelivery={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your parcels.');
  await user.click(screen.getByRole('button', { name: 'Retry loading' }));
  expect(await screen.findByText('You have no assigned parcels.')).toBeInTheDocument();
});
