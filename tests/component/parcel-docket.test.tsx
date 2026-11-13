import { it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ParcelDocket } from '@/components/parcel-docket';

it('a failed docket shows the actual failed outcome and recorded timestamps without a Delivered stage', () => {
  render(<ParcelDocket trackingNumber={'PTL-' + 'A'.repeat(32)} status="FAILED" history={[
    { status: 'REGISTERED', changedAt: '2026-11-12T00:00:00Z' },
    { status: 'FAILED', changedAt: '2026-11-13T03:25:00Z' },
  ]} />);
  const journey = screen.getByRole('list', { name: 'Parcel journey' });
  expect(within(journey).getByRole('heading', { name: 'Failed' }).closest('li')).toHaveAttribute('aria-current', 'step');
  expect(within(journey).queryByText('Delivered')).not.toBeInTheDocument();
  expect(journey.querySelectorAll('time')).toHaveLength(2);
  expect(within(journey).getAllByText('Pending')).toHaveLength(2);
  expect(screen.queryByText(/Sample record/)).not.toBeInTheDocument();
});

it('a registered docket never invents times or completion marks for future stages', () => {
  render(<ParcelDocket trackingNumber="PTL-DEMO-003" status="REGISTERED" history={[
    { status: 'REGISTERED', changedAt: '2026-11-13T02:15:00Z' },
  ]} sample />);
  expect(screen.getByText('Sample record')).toBeInTheDocument();
  const journey = screen.getByRole('list', { name: 'Parcel journey' });
  expect(within(journey).getAllByText('Pending')).toHaveLength(3);
  expect(journey.querySelectorAll('time')).toHaveLength(1);
  expect(within(journey).queryByText('✓')).not.toBeInTheDocument();
});
