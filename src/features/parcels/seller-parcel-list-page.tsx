'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FieldFeedback } from '@/components/field-feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import { STATUSES, type ParcelStatus } from '@/shared/constants';
import { formatParcelTime, PARCEL_PRESENTATION } from '@/shared/parcel-presentation';
import { parcelListSchema, PARCEL_SORTS } from '@/shared/schemas';
import { useParcelData } from './use-parcel-data';

/** How long typing must pause before the search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX = 64;
type Sort = typeof PARCEL_SORTS[number];
type Filters = { q: string; status: ParcelStatus | ''; sort: Sort };
const SORT_LABEL: Record<Sort, string> = { createdAt: 'Newest first', currentStatus: 'Delivery stage' };
const selectClass = 'min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground';

/** Builds the A11 query. Search text stays in the request only; it is never put in the page URL. */
function listPath(filters: Filters, page: number) {
  const query = new URLSearchParams({ page: String(page) });
  if (filters.q) query.set('q', filters.q);
  if (filters.status) query.set('status', filters.status);
  if (filters.sort !== 'createdAt') query.set('sort', filters.sort);
  return '/seller/parcels?' + query.toString();
}

const waitText = (seconds?: number) => seconds && seconds < 60 ? `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.` : 'Wait a minute, then try again.';

function SellerParcelList() {
  const { principal } = useSession();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<Filters>({ q: '', status: '', sort: 'createdAt' });
  const [page, setPage] = useState(1);
  const typed = text.trim();
  const tooLong = Array.from(typed).length > SEARCH_MAX;

  // Debounce typing; any filter change starts again on page 1. Older responses are discarded by the data hook.
  useEffect(() => {
    if (tooLong || typed === filters.q) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, q: typed })); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, tooLong, filters.q]);

  const update = (change: Partial<Filters>) => { setFilters(current => ({ ...current, ...change })); setPage(1); };
  const clear = () => { setText(''); setFilters({ q: '', status: '', sort: 'createdAt' }); setPage(1); };

  const { result, retry } = useParcelData(listPath(filters, page), parcelListSchema);
  const list = result?.data;
  const failure = result?.error instanceof ApiFailure ? result.error : null;
  const filtered = !!filters.q || !!filters.status;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const searchError = tooLong ? `Use ${SEARCH_MAX} characters or fewer.` : failure?.status === 422 && filters.q ? 'Use 1 to 64 characters.' : undefined;

  return <section aria-labelledby="seller-parcels-title">
    <div className="parcel-workspace-header">
      <div>
        <h1 id="seller-parcels-title">Your parcels</h1>
        <p className="section-label">Signed in as {principal?.displayName}.</p>
      </div>
      <Link href="/seller/parcels/new" className={buttonVariants({ className: 'min-h-11' })}>New parcel</Link>
    </div>

    <div role="search" aria-label="Find parcels" className="mb-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="seller-parcel-search">Search</Label>
        <Input id="seller-parcel-search" type="search" value={text} onChange={event => setText(event.target.value)} autoComplete="off" spellCheck={false}
          placeholder="Tracking number or recipient name" aria-describedby="seller-parcel-search-feedback" aria-invalid={!!searchError} className="min-h-11" />
        <FieldFeedback id="seller-parcel-search-feedback" error={searchError} hint="Matches the start of a tracking number or any part of a recipient name." />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="seller-parcel-status">Status</Label>
        <select id="seller-parcel-status" className={selectClass} value={filters.status}
          onChange={event => update({ status: STATUSES.find(status => status === event.currentTarget.value) ?? '' })}>
          <option value="">All statuses</option>
          {STATUSES.map(status => <option key={status} value={status}>{PARCEL_PRESENTATION[status].label}</option>)}
        </select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="seller-parcel-sort">Order</Label>
        <select id="seller-parcel-sort" className={selectClass} value={filters.sort}
          onChange={event => update({ sort: PARCEL_SORTS.find(sort => sort === event.currentTarget.value) ?? 'createdAt' })}>
          {PARCEL_SORTS.map(sort => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}
        </select>
      </div>
    </div>

    {!result && <p className="guard-status" role="status">Loading parcels…</p>}
    {failure?.status === 429 && <Alert variant="destructive">
      <AlertTitle>Too many requests.</AlertTitle>
      <p>{waitText(failure.retryAfter)}</p>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {result && !list && failure?.status !== 429 && !(failure?.status === 422 && filters.q) && <Alert variant="destructive">
      <AlertTitle>Couldn’t load your parcels.</AlertTitle>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {list && list.total === 0 && (filtered
      ? <div className="parcel-empty" role="status">
        <h2>No parcels match</h2><p className="section-label">Check the spelling, or clear the search and status filter.</p>
        <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={clear}>Clear filters</Button>
      </div>
      : <div className="parcel-empty">
        <h2>No parcels yet</h2><p className="section-label">Register a parcel to get its tracking number.</p>
      </div>)}
    {list && list.total > 0 && <>
      <p className="section-label mb-2">{list.total === 1 ? '1 parcel' : `${list.total} parcels`}{filtered ? ' match' : ''}</p>
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
