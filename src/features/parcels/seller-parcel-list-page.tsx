'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { formatParcelTime, PARCEL_PRESENTATION } from '@/shared/parcel-presentation';
import { parcelListSchema } from '@/shared/schemas';
import { useParcelData } from './use-parcel-data';

function SellerParcelList() {
  const { principal } = useSession();
  const [page, setPage] = useState(1);
  const { result, retry } = useParcelData('/seller/parcels?page=' + page, parcelListSchema);
  const list = result?.data;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return <section aria-labelledby="seller-parcels-title">
    <div className="parcel-workspace-header">
      <div>
        <h1 id="seller-parcels-title">Your parcels</h1>
        <p className="section-label">Signed in as {principal?.displayName}.</p>
      </div>
      <Link href="/seller/parcels/new" className={buttonVariants({ className: 'min-h-11' })}>New parcel</Link>
    </div>
    {!result && <p className="guard-status" role="status">Loading parcels…</p>}
    {result && !list && <Alert variant="destructive">
      <AlertTitle>Couldn’t load your parcels.</AlertTitle>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {list && list.total === 0 && <div className="parcel-empty">
      <h2>No parcels yet</h2><p className="section-label">Register a parcel to get its tracking number.</p>
    </div>}
    {list && list.total > 0 && <>
      <ul className="seller-parcel-records" aria-label="Parcel records">
        {list.items.map(parcel => <li key={parcel.id}>
          <Link className="seller-parcel-record" href={'/parcels/' + parcel.id}>
            <span className="parcel-reference">{parcel.trackingNumber}</span>
            <span className="parcel-record-status">{PARCEL_PRESENTATION[parcel.currentStatus].label}</span>
            <time className="parcel-record-time" dateTime={parcel.createdAt}>{formatParcelTime(parcel.createdAt)}</time>
          </Link>
        </li>)}
      </ul>
      {list.items.length === 0 && <p className="guard-status">There are no parcels on this page.</p>}
      {(pages > 1 || page > 1) && <nav className="parcel-pagination" aria-label="Parcel pages">
        <Button type="button" variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <p className="section-label" role="status">Page {page} of {pages}</p>
        <Button type="button" variant="outline" className="min-h-11" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
      </nav>}
    </>}
  </section>;
}

export function SellerParcelListPage() {
  return <div className="page-width parcel-workspace">
    <RouteGuard role="SELLER"><SellerParcelList /></RouteGuard>
  </div>;
}
