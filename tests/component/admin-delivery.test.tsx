import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AdminDashboardPage } from '@/features/delivery/admin-dashboard-page';
import { AdminParcelListPage } from '@/features/delivery/admin-parcel-list-page';
import type { AdminDashboard, AdminParcelList, AdminParcelSummary } from '@/features/delivery/admin-contract';
import { ApiFailure } from '@/shared/api-client';
import type { UserList } from '@/shared/schemas';

const tracking = (letter: string) => 'PTL-' + letter.repeat(32);
const activeRider: UserList['items'][number] = {
  id: '10', username: 'rider.active', displayName: 'Active Rider', role: 'RIDER',
  mustChangePassword: false, isActive: true, version: 1,
};
const inactiveRider: UserList['items'][number] = {
  id: '11', username: 'rider.inactive', displayName: 'Inactive Rider', role: 'RIDER',
  mustChangePassword: false, isActive: false, version: 2,
};
const parcel: AdminParcelSummary = {
  id: '1', trackingNumber: tracking('A'), currentStatus: 'ASSIGNED', weightKg: '1.250',
  createdAt: '2026-11-28T01:00:00.000Z', version: 3,
  assignedRider: { id: inactiveRider.id, displayName: inactiveRider.displayName, isActive: false },
};
const delivered: AdminParcelSummary = {
  ...parcel, id: '2', trackingNumber: tracking('B'), currentStatus: 'DELIVERED', version: 4,
  assignedRider: { id: activeRider.id, displayName: activeRider.displayName, isActive: true },
};
const list = (items: AdminParcelSummary[], overrides: Partial<AdminParcelList> = {}): AdminParcelList => ({
  items, page: 1, pageSize: 20, total: items.length, ...overrides,
});

it('TC12 filters the Admin list and offers only active Riders for an unfinished parcel', async () => {
  const user = userEvent.setup();
  const load = vi.fn().mockResolvedValue(list([parcel, delivered]));
  render(<AdminParcelListPage loadParcels={load} loadRiders={vi.fn().mockResolvedValue({ all: [activeRider, inactiveRider], active: [activeRider] })} assignParcel={vi.fn()} />);

  const records = await screen.findByRole('list', { name: 'Admin parcel records' });
  expect(within(records).getByText('Needs reassignment')).toBeInTheDocument();
  expect(within(records).queryByRole('button', { name: new RegExp(delivered.trackingNumber) })).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Status'), 'OUT_FOR_DELIVERY');
  await waitFor(() => expect(load).toHaveBeenLastCalledWith({ status: 'OUT_FOR_DELIVERY', page: 1 }, expect.any(AbortSignal)));
  await user.click(screen.getByLabelText('Needs reassignment only'));
  await waitFor(() => expect(load).toHaveBeenLastCalledWith({ status: 'OUT_FOR_DELIVERY', needsReassignment: true, page: 1 }, expect.any(AbortSignal)));

  await user.click(screen.getByRole('button', { name: new RegExp('Reassign Rider.*' + parcel.trackingNumber) }));
  const dialog = await screen.findByRole('dialog');
  const picker = within(dialog).getByLabelText('Active Rider');
  expect(within(picker).getByRole('option', { name: 'Active Rider' })).toBeInTheDocument();
  expect(within(picker).queryByRole('option', { name: /Inactive Rider/ })).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('TC12 saves one assignment with the displayed version, closes, announces and refreshes', async () => {
  const user = userEvent.setup();
  const updated = { ...parcel, version: 4, assignedRider: { id: activeRider.id, displayName: activeRider.displayName, isActive: true } };
  const load = vi.fn().mockResolvedValueOnce(list([parcel])).mockResolvedValueOnce(list([updated]));
  const assign = vi.fn().mockResolvedValue(undefined);
  render(<AdminParcelListPage loadParcels={load} loadRiders={vi.fn().mockResolvedValue({ all: [activeRider, inactiveRider], active: [activeRider] })} assignParcel={assign} />);

  await user.click(await screen.findByRole('button', { name: /Reassign Rider/ }));
  await user.selectOptions(screen.getByLabelText('Active Rider'), activeRider.id);
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(parcel.id, activeRider.id, 3));
  expect(assign).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Rider assignment saved/)).toBeInTheDocument();
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('TC12 refreshes a stale version after 409 and requires a deliberate second submission', async () => {
  const user = userEvent.setup();
  const refreshed = { ...parcel, version: 4 };
  const saved = { ...refreshed, version: 5, assignedRider: { id: activeRider.id, displayName: activeRider.displayName, isActive: true } };
  const load = vi.fn().mockResolvedValueOnce(list([parcel])).mockResolvedValueOnce(list([refreshed])).mockResolvedValueOnce(list([saved]));
  const assign = vi.fn().mockRejectedValueOnce(new ApiFailure(409, 'VERSION_CONFLICT')).mockResolvedValueOnce(undefined);
  render(<AdminParcelListPage loadParcels={load} loadRiders={vi.fn().mockResolvedValue({ all: [activeRider], active: [activeRider] })} assignParcel={assign} />);

  await user.click(await screen.findByRole('button', { name: /Reassign Rider/ }));
  await user.selectOptions(screen.getByLabelText('Active Rider'), activeRider.id);
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('latest version');
  expect(screen.getByText(/saved parcel version is 4/i)).toBeInTheDocument();
  expect(assign).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));
  await waitFor(() => expect(assign).toHaveBeenNthCalledWith(2, parcel.id, activeRider.id, 4));
  expect(await screen.findByText(/Rider assignment saved/)).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(3);
});

it('TC12 closes a stale dialog when the refreshed parcel has become terminal', async () => {
  const user = userEvent.setup();
  const nowDelivered = { ...parcel, currentStatus: 'DELIVERED' as const, version: 4 };
  const load = vi.fn().mockResolvedValueOnce(list([parcel])).mockResolvedValueOnce(list([nowDelivered]));
  const assign = vi.fn().mockRejectedValueOnce(new ApiFailure(409, 'VERSION_CONFLICT'));
  render(<AdminParcelListPage loadParcels={load} loadRiders={vi.fn().mockResolvedValue({ all: [activeRider], active: [activeRider] })} assignParcel={assign} />);

  await user.click(await screen.findByRole('button', { name: /Reassign Rider/ }));
  await user.selectOptions(screen.getByLabelText('Active Rider'), activeRider.id);
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));
  expect(await screen.findByText('The parcel is now delivered and can no longer be assigned.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Reassign Rider/ })).not.toBeInTheDocument();
  expect(assign).toHaveBeenCalledOnce();
});

it('TC12 clears a Rider who becomes invalid and refreshes the active directory', async () => {
  const user = userEvent.setup();
  const replacement = { ...activeRider, id: '12', username: 'rider.replacement', displayName: 'Replacement Rider' };
  const loadRiders = vi.fn()
    .mockResolvedValueOnce({ all: [activeRider], active: [activeRider] })
    .mockResolvedValueOnce({ all: [inactiveRider, replacement], active: [replacement] });
  const assign = vi.fn().mockRejectedValueOnce(new ApiFailure(422, 'INVALID_ASSIGNEE'));
  render(<AdminParcelListPage loadParcels={vi.fn().mockResolvedValue(list([parcel]))} loadRiders={loadRiders} assignParcel={assign} />);

  await user.click(await screen.findByRole('button', { name: /Reassign Rider/ }));
  await user.selectOptions(screen.getByLabelText('Active Rider'), activeRider.id);
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no longer active');
  await waitFor(() => expect(loadRiders).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Active Rider')).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Replacement Rider' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save assignment' })).toBeDisabled();
  expect(assign).toHaveBeenCalledOnce();
});

it('TC12 explains failed reads, retries them, and distinguishes a first-use empty list', async () => {
  const user = userEvent.setup();
  const load = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(list([]));
  const loadRiders = vi.fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce({ all: [activeRider], active: [activeRider] });
  render(<AdminParcelListPage loadParcels={load} loadRiders={loadRiders} assignParcel={vi.fn()} />);

  expect(await screen.findByText('Could not load the Admin parcel list.')).toBeInTheDocument();
  expect(screen.getByText(/Could not load the Rider directory/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry Rider directory' }));
  await user.click(screen.getByRole('button', { name: 'Retry parcel list' }));
  expect(await screen.findByRole('heading', { name: 'No parcels yet' })).toBeInTheDocument();
  expect(screen.getByText('Registered parcels will appear here for assignment.')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
  expect(loadRiders).toHaveBeenCalledTimes(2);
});

it('TC12 renders all five dashboard statuses when every count is zero', async () => {
  const dashboard: AdminDashboard = {
    counts: { REGISTERED: 0, ASSIGNED: 0, OUT_FOR_DELIVERY: 0, DELIVERED: 0, FAILED: 0 },
    total: 0, generatedAt: '2026-11-28T02:03:00.000Z',
  };
  render(<AdminDashboardPage loadDashboard={vi.fn().mockResolvedValue(dashboard)} />);
  expect(await screen.findByRole('link', { name: 'Registered' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Assigned' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Out for delivery' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Delivered' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Failed' })).toBeInTheDocument();
  expect(screen.getAllByText('0')).toHaveLength(6);
});

it('TC12 retries a failed dashboard read, then exposes the total and status destinations', async () => {
  const user = userEvent.setup();
  const dashboard: AdminDashboard = {
    counts: { REGISTERED: 0, ASSIGNED: 2, OUT_FOR_DELIVERY: 0, DELIVERED: 1, FAILED: 0 },
    total: 3, generatedAt: '2026-11-28T02:03:00.000Z',
  };
  const load = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(dashboard);
  render(<AdminDashboardPage loadDashboard={load} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  await user.click(screen.getByRole('button', { name: 'Retry dashboard' }));
  expect(await screen.findByRole('link', { name: 'Registered' })).toHaveAttribute('href', '/admin/parcels?status=REGISTERED');
  expect(screen.getByRole('link', { name: 'Failed' })).toHaveAttribute('href', '/admin/parcels?status=FAILED');
  expect(screen.getByRole('link', { name: 'View all parcels' })).toHaveAttribute('href', '/admin/parcels');
  expect(screen.getByText('3', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getAllByText('0')).toHaveLength(3);
  expect(screen.getByText(/Counts generated/).querySelector('time')).toHaveAttribute('datetime', dashboard.generatedAt);
  expect(load).toHaveBeenCalledTimes(2);
});
