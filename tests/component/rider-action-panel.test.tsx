import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RiderActionPanelView } from '@/features/delivery/rider-action-panel';
import { ApiFailure } from '@/shared/api-client';
import { LIMITS } from '@/shared/constants';
import type { ParcelDetail } from '@/shared/schemas';

const parcel = (status: 'ASSIGNED' | 'OUT_FOR_DELIVERY', version = status === 'ASSIGNED' ? 2 : 3): ParcelDetail => ({
  id: '12', trackingNumber: 'PTL-' + 'A'.repeat(32), currentStatus: status,
  weightKg: '1.250', createdAt: '2026-11-28T00:00:00.000Z', version,
  recipient: { name: 'Synthetic Recipient', phone: '+60123456789', address: 'Synthetic address' },
  assignedRider: { id: '21', displayName: 'Rider A', isActive: true },
  history: [{ status, changedAt: '2026-11-28T00:00:00.000Z' }],
  hasProof: false, anonymized: false, terminalAt: null,
});
const jpg = (name = 'proof.jpg', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

it('M3-PH3-TC13 starts delivery once with the displayed version and refreshes', async () => {
  const user = userEvent.setup();
  const deferred = Promise.withResolvers<void>();
  const update = vi.fn(() => deferred.promise);
  const changed = vi.fn();
  render(<RiderActionPanelView parcel={parcel('ASSIGNED')} onChanged={changed} updateStatus={update} />);

  await user.click(screen.getByRole('button', { name: 'Start delivery' }));
  expect(update).toHaveBeenCalledWith('12', 'OUT_FOR_DELIVERY', 2, undefined);
  expect(screen.getByRole('button', { name: 'Starting delivery…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Starting delivery…' }));
  expect(update).toHaveBeenCalledOnce();
  await act(async () => deferred.resolve());
  expect(changed).toHaveBeenCalledOnce();
  expect(screen.getByText('Delivery started.')).toBeVisible();
});

it('M3-PH3-TC13 rejects missing, oversized, wrong-type and double-extension photos before upload', async () => {
  const user = userEvent.setup();
  const update = vi.fn();
  render(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY')} onChanged={vi.fn()} updateStatus={update} />);
  await user.click(screen.getByLabelText('Delivered'));
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));
  expect(screen.getAllByText('Choose one JPG or PNG photo.')).toHaveLength(2);

  const input = screen.getByLabelText('Proof photo');
  fireEvent.change(input, { target: { files: [new File(['plain text'], 'proof.txt', { type: 'text/plain' })] } });
  expect(screen.getByText(/one image extension/)).toBeVisible();
  fireEvent.change(input, { target: { files: [jpg('shell.php.jpg')] } });
  expect(screen.getByText(/double-extension files are not accepted/)).toBeVisible();
  fireEvent.change(input, { target: { files: [jpg('large.jpg', LIMITS.proofBytes + 1)] } });
  expect(screen.getByText(/larger than 3 MiB/)).toBeVisible();
  expect(update).not.toHaveBeenCalled();
});

it('M3-PH3-TC13 submits one selected outcome and proof, then prevents a second pending mutation', async () => {
  const user = userEvent.setup();
  const deferred = Promise.withResolvers<void>();
  const update = vi.fn(() => deferred.promise);
  const changed = vi.fn();
  render(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY')} onChanged={changed} updateStatus={update} />);
  const proof = jpg();
  await user.click(screen.getByLabelText('Failed'));
  await user.upload(screen.getByLabelText('Proof photo'), proof);
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));
  expect(update).toHaveBeenCalledWith('12', 'FAILED', 3, proof);
  expect(screen.getByRole('button', { name: 'Saving outcome…' })).toBeDisabled();
  await act(async () => deferred.resolve());
  expect(changed).toHaveBeenCalledOnce();
});

it('M3-PH3-TC13 keeps the selected photo on 409 and requires refreshed props before a deliberate retry', async () => {
  const user = userEvent.setup();
  const update = vi.fn()
    .mockRejectedValueOnce(new ApiFailure(409, 'VERSION_CONFLICT'))
    .mockResolvedValueOnce(undefined);
  const changed = vi.fn();
  const first = parcel('OUT_FOR_DELIVERY', 3);
  const view = render(<RiderActionPanelView parcel={first} onChanged={changed} updateStatus={update} />);
  const proof = jpg();
  await user.click(screen.getByLabelText('Delivered'));
  await user.upload(screen.getByLabelText('Proof photo'), proof);
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));

  expect(await screen.findByText('The parcel changed.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Refreshing parcel…' })).toBeDisabled();
  expect(screen.getByLabelText('Proof photo')).toHaveProperty('files.0', proof);
  expect(changed).toHaveBeenCalledOnce();

  view.rerender(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY', 4)} onChanged={changed} updateStatus={update} />);
  expect(await screen.findByRole('button', { name: 'Save outcome' })).toBeEnabled();
  expect(screen.getByLabelText('Proof photo')).toHaveProperty('files.0', proof);
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));
  expect(update).toHaveBeenLastCalledWith('12', 'DELIVERED', 4, proof);
  expect(update).toHaveBeenCalledTimes(2);
});

it('M3-PH3-TC13 refreshes after an uncertain result and never replays automatically', async () => {
  const user = userEvent.setup();
  const update = vi.fn().mockRejectedValue(new TypeError('Connection lost'));
  const changed = vi.fn();
  render(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY')} onChanged={changed} updateStatus={update} />);
  await user.click(screen.getByLabelText('Delivered'));
  await user.upload(screen.getByLabelText('Proof photo'), jpg());
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));
  expect(await screen.findByText('The result is uncertain.')).toBeVisible();
  expect(update).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
});

it('M3-PH3-TC13 stays blocked after a success until the refreshed parcel arrives', async () => {
  const user = userEvent.setup();
  const update = vi.fn().mockResolvedValue(undefined);
  const view = render(<RiderActionPanelView parcel={parcel('ASSIGNED')} onChanged={vi.fn()} updateStatus={update} />);
  await user.click(screen.getByRole('button', { name: 'Start delivery' }));
  const waiting = screen.getByRole('button', { name: 'Refreshing parcel…' });
  expect(waiting).toBeDisabled();
  await user.click(waiting);
  expect(update).toHaveBeenCalledOnce();
  expect(screen.getByText('Refreshing the parcel with its latest status.')).toBeVisible();

  view.rerender(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY')} onChanged={vi.fn()} updateStatus={update} />);
  expect(screen.getByRole('button', { name: 'Save outcome' })).toBeEnabled();
  expect(screen.getByText('Delivery started.')).toBeVisible();
  expect(screen.getByText('Record the outcome when the delivery is finished.')).toBeVisible();
  expect(screen.queryByText('Refreshing the parcel with its latest status.')).toBeNull();
});

it('M3-PH3-TC13 stops saying it will refresh once the refreshed parcel arrives after a 409', async () => {
  const user = userEvent.setup();
  const update = vi.fn().mockRejectedValue(new ApiFailure(409, 'VERSION_CONFLICT'));
  const view = render(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY', 3)} onChanged={vi.fn()} updateStatus={update} />);
  await user.click(screen.getByLabelText('Delivered'));
  await user.upload(screen.getByLabelText('Proof photo'), jpg());
  await user.click(screen.getByRole('button', { name: 'Save outcome' }));
  expect(await screen.findByText(/The parcel will refresh before/)).toBeVisible();

  view.rerender(<RiderActionPanelView parcel={parcel('OUT_FOR_DELIVERY', 4)} onChanged={vi.fn()} updateStatus={update} />);
  expect(screen.getByText('The parcel changed.')).toBeVisible();
  expect(screen.getByText('Check the latest status, then submit again if it is still needed.')).toBeVisible();
  expect(screen.queryByText(/The parcel will refresh before/)).toBeNull();
});
