'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AUDIT_TYPES } from '@/shared/constants';
import { formatParcelTime } from '@/shared/parcel-presentation';
import type { AuditList } from '@/shared/schemas';
import type { AdminUsersApi, AuditEvent, AuditFilters, AuditType } from './admin-users-api';

// Plain-language names for the contract's event types. The list is exhaustive so a new type fails typecheck here.
const EVENT_LABEL: Record<AuditType, string> = {
  LOGIN_SUCCEEDED: 'Signed in', LOGIN_FAILED: 'Sign-in failed', LOGIN_THROTTLED: 'Sign-in blocked for too many attempts', LOGOUT: 'Signed out',
  PASSWORD_CHANGED: 'Password changed', PASSWORD_RESET: 'Password reset by an Admin', USER_CREATED: 'Account created', USER_STATUS_CHANGED: 'Account enabled or disabled',
  ACCOUNT_LOCKED: 'Account locked', ACCOUNT_RECOVERED: 'Account recovered', SESSIONS_PURGED: 'Old sessions removed',
  PARCEL_REGISTERED: 'Parcel registered', PARCEL_ASSIGNED: 'Parcel assigned', PARCEL_REASSIGNED: 'Parcel reassigned', STATUS_CHANGED: 'Parcel status changed',
  PROOF_UPLOADED: 'Delivery proof uploaded', PARCEL_VIEWED: 'Parcel viewed', PROOF_VIEWED: 'Delivery proof viewed',
  RETENTION_ANONYMIZED: 'Parcel details anonymized', PROOF_PURGED: 'Delivery proof removed',
};
const DETAIL_LABEL: Record<string, string> = {
  scope: 'Scope', reason: 'Reason', usernameLength: 'Username length', retryAfter: 'Retry after (s)', role: 'Role', isActive: 'Active',
  oldStatus: 'From', newStatus: 'To', status: 'Status', oldRiderId: 'Old Rider', newRiderId: 'New Rider', mediaType: 'Type', sizeBytes: 'Size (bytes)',
};
const detailText = (details: AuditEvent['details']) => Object.entries(details)
  .filter(([key]) => key in DETAIL_LABEL)
  .map(([key, value]) => `${DETAIL_LABEL[key]}: ${String(value)}`).join(' · ');

type Loaded = { key: string; data?: AuditList; error?: unknown };

/** The Admin audit panel (A20): newest events first, filtered by type. Loads only once it has been opened. */
export function AdminAuditPanel({ api }: { api: AdminUsersApi }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  const key = JSON.stringify(filters) + '#' + attempt;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void api.listAudit(filters, controller.signal).then(
      data => { if (!controller.signal.aborted) setLoaded({ key, data }); },
      error => { if (!controller.signal.aborted) setLoaded({ key, error }); },
    );
    return () => controller.abort();
  }, [api, filters, key, open]);

  const current = loaded?.key === key ? loaded : undefined;
  const data = current?.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return <section aria-labelledby="audit-heading" className="grid gap-4 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="audit-heading" className="text-3xl">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign-ins, account changes and parcel events, newest first.</p>
      </div>
      <Button type="button" variant="outline" aria-expanded={open} aria-controls="audit-body" onClick={() => setOpen(!open)}>{open ? 'Hide activity' : 'Show activity'}</Button>
    </div>
    <div id="audit-body" hidden={!open} className="grid gap-4">
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="audit-type">Event type</Label>
        <select id="audit-type" className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={filters.eventType ?? ''}
          onChange={event => setFilters({ eventType: AUDIT_TYPES.find(type => type === event.currentTarget.value), page: 1 })}>
          <option value="">All events</option>
          {AUDIT_TYPES.map(type => <option key={type} value={type}>{EVENT_LABEL[type]}</option>)}
        </select>
      </div>
      {open && !current && <p role="status" className="text-sm text-muted-foreground">Loading activity…</p>}
      {!!current?.error && <div className="grid justify-items-start gap-3">
        <p role="alert" className="text-destructive">Could not load the activity list.</p>
        <Button type="button" variant="outline" onClick={() => setAttempt(count => count + 1)}>Retry activity</Button>
      </div>}
      {data?.total === 0 && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{filters.eventType ? 'No events of this type yet.' : 'No activity has been recorded yet.'}</p>}
      {!!data?.items.length && <ul aria-label="Recent activity" className="divide-y divide-border border-y border-border">
        {data.items.map(event => <li key={event.id} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <time dateTime={event.occurredAt} className="text-xs text-muted-foreground sm:pt-1">{formatParcelTime(event.occurredAt)}</time>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{EVENT_LABEL[event.eventType]}{event.outcome === 'FAILURE' && <span className="ml-2 rounded-sm border border-destructive px-1.5 py-0.5 text-xs font-medium text-destructive">Failed</span>}</p>
            <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {[event.actorId && `By account ${event.actorId}`, event.targetUserId && `On account ${event.targetUserId}`, event.parcelId && `Parcel ${event.parcelId}`].filter(Boolean).join(' · ') || 'No account recorded'}
              {detailText(event.details) && <> · {detailText(event.details)}</>}
            </p>
          </div>
        </li>)}
      </ul>}
      {data && (pages > 1 || data.page > 1) && <nav aria-label="Activity pages" className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={data.page <= 1} onClick={() => setFilters(f => ({ ...f, page: data.page - 1 }))}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {data.page} of {pages}</span>
        <Button type="button" variant="outline" disabled={data.page >= pages} onClick={() => setFilters(f => ({ ...f, page: data.page + 1 }))}>Next</Button>
      </nav>}
    </div>
  </section>;
}
