'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ParcelDocket } from '@/components/parcel-docket';
import { ParcelStatusBadge } from '@/components/parcel-status';
import { FieldFeedback } from '@/components/field-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findSampleParcel, sampleParcels } from '@/features/preview/sample-parcels';
import type { ParcelStatus } from '@/shared/constants';
import { PARCEL_PRESENTATION, formatParcelTime, type ParcelJourneyEvent } from '@/shared/parcel-presentation';
import { publicTrackingSchema } from '@/shared/schemas';

const TOKEN = /^PTL-[0-9A-F]{32}$/;
const FORMAT_HINT = 'Enter the full number: PTL- followed by 32 letters A to F or digits.';

type Shown = { number: string; status: ParcelStatus; history: readonly ParcelJourneyEvent[]; sample: boolean };
type Outcome =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'loading' }
  | { kind: 'found'; parcel: Shown }
  | { kind: 'missing' }
  | { kind: 'limited'; retryAfter?: number }
  | { kind: 'offline' }
  | { kind: 'unavailable' };

/** A13 never needs a session or CSRF token. No cookie is sent, nothing is stored, and the number stays out of the URL. */
async function lookup(trackingNumber: string, signal: AbortSignal, fetcher: typeof fetch): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetcher('/api/v1/public/tracking', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trackingNumber }),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { kind: 'offline' };
  }
  if (response.status === 404) return { kind: 'missing' };
  if (response.status === 422) return { kind: 'invalid', message: FORMAT_HINT };
  if (response.status === 429) {
    const retry = Number(response.headers.get('retry-after'));
    return { kind: 'limited', retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined };
  }
  if (!response.ok) return { kind: 'unavailable' };
  const parsed = publicTrackingSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.history.length === 0) return { kind: 'unavailable' };
  const history = parsed.data.history as ParcelJourneyEvent[];
  // The service orders history oldest first (time, then id), so the last item is the current state.
  return { kind: 'found', parcel: { number: trackingNumber, status: history[history.length - 1].status, history, sample: false } };
}

const waitText = (seconds?: number) => !seconds ? 'Wait a minute, then try again.'
  : seconds < 60 ? `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.` : 'Wait a minute, then try again.';

export function TrackPage({ initialSample = '', fetcher = (...args) => fetch(...args) }: { initialSample?: string; fetcher?: typeof fetch }) {
  const initial = initialSample ? findSampleParcel(initialSample) : undefined;
  const [number, setNumber] = useState(initial?.number ?? '');
  const [outcome, setOutcome] = useState<Outcome>(() => initial
    ? { kind: 'found', parcel: { number: initial.number, status: initial.status, history: initial.history, sample: true } }
    : { kind: 'empty' });
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const settle = (next: Outcome, focus: 'result' | 'input') => {
    setOutcome(next);
    requestAnimationFrame(() => (focus === 'input' ? input.current : result.current)?.focus());
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = number.trim().toUpperCase();
    if (!value) return settle({ kind: 'invalid', message: 'Enter a tracking number to continue.' }, 'input');
    if (!TOKEN.test(value)) return settle({ kind: 'invalid', message: FORMAT_HINT }, 'input');
    setNumber(value);
    // Only the latest lookup may update the screen; an earlier slow answer is cancelled.
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setOutcome({ kind: 'loading' });
    try {
      const next = await lookup(value, controller.signal, fetcher);
      if (pending.current !== controller) return;
      pending.current = null;
      settle(next, next.kind === 'invalid' ? 'input' : 'result');
    } catch { /* Superseded by a newer lookup or the page closing. */ }
  }

  function showSample(sampleNumber: string) {
    const sample = findSampleParcel(sampleNumber);
    if (!sample) return;
    pending.current?.abort();
    pending.current = null;
    setNumber('');
    settle({ kind: 'found', parcel: { number: sample.number, status: sample.status, history: sample.history, sample: true } }, 'result');
  }

  const parcel = outcome.kind === 'found' ? outcome.parcel : null;
  const presentation = parcel ? PARCEL_PRESENTATION[parcel.status] : null;
  const latest = parcel ? parcel.history.toSorted((a, b) => b.changedAt.localeCompare(a.changedAt))[0] : null;
  const loading = outcome.kind === 'loading';
  const fieldError = outcome.kind === 'invalid' ? outcome.message : undefined;

  return <>
    <div className="tracking-layout">
      <div className="tracking-copy">
        <h1 className="section-label">Track a parcel</h1>
        <div className="tracking-status" aria-live="polite">
          <h2>{presentation?.label ?? 'Every handoff.\nOne clear story.'}</h2>
          <p className="lead">{presentation?.description ?? 'Follow the recorded journey, from registration to the final delivery update.'}</p>
          {latest && <p className="last-update">Last recorded update <time dateTime={latest.changedAt}>{formatParcelTime(latest.changedAt)}</time>{parcel?.sample ? ' (sample)' : ''}</p>}
        </div>
        {/* method="post": a submit before the page is interactive must not put the number in the URL. */}
        <form className="tracking-form" method="post" onSubmit={submit} noValidate>
          <Label htmlFor="tracking-number">Tracking number</Label>
          <div className="input-action">
            <Input ref={input} id="tracking-number" name="trackingNumber" value={number} onChange={event => setNumber(event.target.value)} maxLength={64}
              placeholder="PTL-…" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="number-feedback" aria-invalid={!!fieldError} />
            <Button type="submit" disabled={loading}>{loading ? 'Finding parcel…' : 'Track parcel'}</Button>
          </div>
          <FieldFeedback id="number-feedback" error={fieldError} hint="Find this on your parcel registration record." />
        </form>
        <p className="tracking-privacy">Public tracking shows status and timestamps only.<br />Recipient details and delivery photos stay private.</p>
      </div>
      <section className="tracking-result" ref={result} tabIndex={-1} aria-label="Tracking result" aria-busy={loading}>
        {parcel ? <ParcelDocket trackingNumber={parcel.number} status={parcel.status} history={parcel.history} sample={parcel.sample} />
          : loading ? <Message label="Looking up" title="Finding your parcel…" text="Checking the recorded handoffs." />
            : outcome.kind === 'missing' ? <Message label="No match" title="We couldn’t find that parcel." text="Check the number against your registration record. Every character counts." />
              : outcome.kind === 'limited' ? <Message label="Too many lookups" title="Please wait a moment." text={`Lookups from this connection are limited. ${waitText(outcome.retryAfter)}`} />
                : outcome.kind === 'offline' ? <Message label="Connection problem" title="We couldn’t reach ParcelTrack." text="Check your connection, then try again. Your number is still in the field." />
                  : outcome.kind === 'unavailable' ? <Message label="Unavailable" title="Tracking isn’t available right now." text="Try again shortly. Your number is still in the field." />
                    : <div className="empty-paper"><span className="section-label">A delivery, step by step</span><h2>Your parcel’s story starts here.</h2><p>Enter a tracking number, or choose a sample below to see how recorded handoffs appear.</p><ol className="empty-steps"><li>Registered</li><li>Assigned</li><li>Out for delivery</li><li>Final outcome</li></ol></div>}
      </section>
    </div>
    <section className="sample-picker" aria-labelledby="samples-title"><div><h2 id="samples-title">Take a sample journey.</h2><p>Synthetic parcels in five stages. Choosing one never sends a lookup.</p></div><div className="sample-list">{sampleParcels.map(item => <Button variant="ghost" className="sample-choice h-auto min-h-16 w-full justify-between rounded-none border-0 border-b px-2 py-3 text-left font-normal" key={item.number} type="button" disabled={loading} aria-pressed={parcel?.sample === true && parcel.number === item.number} onClick={() => showSample(item.number)}><span className="sample-number">{item.number}</span><ParcelStatusBadge status={item.status} /></Button>)}</div></section>
  </>;
}

function Message({ label, title, text }: { label: string; title: string; text: string }) {
  return <div className="empty-paper" role="status"><span className="section-label">{label}</span><h2>{title}</h2><p>{text}</p></div>;
}
