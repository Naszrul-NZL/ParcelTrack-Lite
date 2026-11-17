'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ParcelStatusBadge } from '@/components/parcel-status';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiFailure } from '@/shared/api-client';
import { STATUSES, type ParcelStatus } from '@/shared/constants';
import { PARCEL_PRESENTATION } from '@/shared/parcel-presentation';
import type { RiderList } from './rider-contract';

type Filters = { status?: ParcelStatus; page: number };
type Listing = { filters: Filters; data: RiderList | null };
type Notice = { text: string; error?: boolean };
type Props = {
  loadParcels: (filters: Filters, signal: AbortSignal) => Promise<RiderList>;
  startDelivery: (parcelId: string, expectedVersion: number) => Promise<void>;
};

export function RiderParcelListPage({ loadParcels, startDelivery }: Props) {
  const [filters, setFilters] = useState<Filters>({ page: 1 });
  const [listing, setListing] = useState<Listing>();
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState<string>();
  const mutation = useRef(false);
  const updateMessage = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadParcels(filters, controller.signal).then(data => {
      if (!controller.signal.aborted) setListing({ filters, data });
    }, () => {
      if (!controller.signal.aborted) setListing({ filters, data: null });
    });
    return () => controller.abort();
  }, [loadParcels, filters]);

  const loaded = listing?.filters === filters ? listing : undefined;
  const data = loaded?.data;

  async function start(parcel: RiderList['items'][number], button: HTMLElement) {
    if (mutation.current || parcel.currentStatus !== 'ASSIGNED') return;
    mutation.current = true;
    setPending(parcel.id);
    setNotice(undefined);
    let refresh = true;
    try {
      await startDelivery(parcel.id, parcel.version);
      setNotice({ text: 'Delivery started.' });
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409) {
        setNotice({ text: 'The parcel changed. Check its latest status before trying again.', error: true });
      } else if (error instanceof ApiFailure && error.status < 500) {
        refresh = error.status === 404;
        setNotice({ text: refresh ? 'This parcel is no longer available.' : 'Could not start delivery. Check your access and try again.', error: true });
      } else {
        setNotice({ text: 'The result is uncertain. Check the refreshed status before trying again.', error: true });
      }
    } finally {
      if (refresh) {
        if (document.activeElement === button || document.activeElement === document.body) updateMessage.current?.focus();
        setFilters({ ...filters });
      }
      mutation.current = false;
      setPending(undefined);
    }
  }

  return (
    <section className="page-width grid gap-6 py-8 sm:py-12" aria-labelledby="rider-parcels-heading">
      <h1 id="rider-parcels-heading" className="text-[clamp(2.5rem,6vw,4rem)]">Assigned parcels</h1>
      <div className="grid max-w-60 gap-2">
        <Label htmlFor="rider-status">Status</Label>
        <select
          id="rider-status"
          className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground"
          value={filters.status ?? ''}
          disabled={!!pending}
          onChange={event => {
            setNotice(undefined);
            const status = STATUSES.find(value => value === event.currentTarget.value);
            setFilters({ status, page: 1 });
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.filter(status => status !== 'REGISTERED').map(status => (
            <option key={status} value={status}>{PARCEL_PRESENTATION[status].label}</option>
          ))}
        </select>
      </div>
      <p ref={updateMessage} tabIndex={-1} role="status" className={notice ? (notice.error ? 'text-destructive' : 'text-success') : 'sr-only'}>
        {pending ? 'Starting delivery…' : notice?.text}
      </p>
      {!loaded && <p role="status" className="text-muted-foreground">Loading parcels…</p>}
      <div aria-busy={!loaded}>
        {loaded && !data && (
          <div className="grid justify-items-start gap-3">
            <p role="alert" className="text-destructive">Could not load your parcels.</p>
            <Button type="button" variant="outline" onClick={() => setFilters({ ...filters })}>Retry loading</Button>
          </div>
        )}
        {data?.total === 0 && <p className="text-muted-foreground">{filters.status ? 'No parcels match this status.' : 'You have no assigned parcels.'}</p>}
        {data && data.total > 0 && data.items.length === 0 && <p className="text-muted-foreground">There are no parcels on this page.</p>}
        {!!data?.items.length && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4 text-card-foreground">
            {data.items.map(parcel => (
              <li key={parcel.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 justify-items-start">
                  <ParcelStatusBadge status={parcel.currentStatus} />
                  <Link href={`/parcels/${parcel.id}`} className="inline-flex min-h-11 max-w-full items-center rounded-sm font-mono text-sm underline">
                    <span className="[overflow-wrap:anywhere]">{parcel.trackingNumber}</span>
                  </Link>
                </div>
                {parcel.currentStatus === 'ASSIGNED' && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!!pending}
                    onClick={event => void start(parcel, event.currentTarget)}
                  >
                    {pending === parcel.id ? 'Starting delivery…' : 'Start delivery'}
                    <span className="sr-only"> for {parcel.trackingNumber}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && (data.total > data.pageSize || data.page > 1) && (
          <nav aria-label="Parcel pages" className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={!!pending || data.page === 1}
              onClick={() => setFilters({ ...filters, page: data.page - 1 })}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {data.page}</span>
            <Button type="button" variant="outline" size="sm" disabled={!!pending || data.page * data.pageSize >= data.total}
              onClick={() => setFilters({ ...filters, page: data.page + 1 })}>Next</Button>
          </nav>
        )}
      </div>
    </section>
  );
}
