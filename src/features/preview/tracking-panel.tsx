'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findSampleParcel, sampleParcels, type SampleParcel } from './sample-parcels';
import { ParcelDocket } from '@/components/parcel-docket';
import { ParcelStatusBadge } from '@/components/parcel-status';
import { FieldFeedback } from '@/components/field-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PARCEL_PRESENTATION, formatParcelTime } from '@/shared/parcel-presentation';

type Outcome = { kind: 'empty' | 'loading' | 'missing' | 'invalid' } | { kind: 'found'; parcel: SampleParcel };
function lookup(number: string): Outcome {
  const parcel = findSampleParcel(number);
  return parcel ? { kind: 'found', parcel } : { kind: 'missing' };
}

export function TrackingPanel({ initialNumber }: { initialNumber: string }) {
  const [number, setNumber] = useState(initialNumber);
  const [outcome, setOutcome] = useState<Outcome>(() => initialNumber ? lookup(initialNumber) : { kind: 'empty' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function showParcel(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) { setOutcome({ kind: 'invalid' }); input.current?.focus(); return; }
    setNumber(value.trim().toUpperCase());
    setOutcome({ kind: 'loading' });
    timer.current = setTimeout(() => {
      setOutcome(lookup(value));
      requestAnimationFrame(() => result.current?.focus());
    }, 350);
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); showParcel(number); }
  const parcel = outcome.kind === 'found' ? outcome.parcel : null;
  const presentation = parcel ? PARCEL_PRESENTATION[parcel.status] : null;

  return <>
    <div className="tracking-layout">
      <div className="tracking-copy">
        <h1 className="section-label">Track a parcel</h1>
        <div className="tracking-status" aria-live="polite">
          <h2>{presentation?.label ?? 'Every handoff.\nOne clear story.'}</h2>
          <p className="lead">{presentation?.description ?? 'Follow the recorded journey, from registration to the final delivery update.'}</p>
          {parcel && <p className="last-update">Last recorded update <time dateTime={parcel.history[0].changedAt}>{formatParcelTime(parcel.history[0].changedAt)}</time></p>}
        </div>
        <form className="tracking-form" onSubmit={submit} noValidate>
          <Label htmlFor="tracking-number">Tracking number</Label>
          <div className="input-action"><Input ref={input} id="tracking-number" value={number} onChange={event => setNumber(event.target.value)} maxLength={64} placeholder="Enter your tracking number" autoComplete="off" spellCheck={false} aria-describedby="number-feedback" aria-invalid={outcome.kind === 'invalid'} /><Button type="submit" disabled={outcome.kind === 'loading'}>{outcome.kind === 'loading' ? 'Showing sample…' : 'Track parcel'}</Button></div>
          <FieldFeedback id="number-feedback" error={outcome.kind === 'invalid' ? 'Enter a tracking number to continue.' : undefined} hint="Find this on your parcel registration record." />
        </form>
        <p className="tracking-privacy">Public tracking shows status and timestamps only.<br />Recipient details and delivery photos stay private.</p>
      </div>
      <section className="tracking-result" ref={result} tabIndex={-1} aria-label="Tracking result" aria-busy={outcome.kind === 'loading'}>
        {parcel ? <ParcelDocket trackingNumber={parcel.number} status={parcel.status} history={parcel.history} sample />
          : outcome.kind === 'loading' ? <div className="empty-paper" role="status"><span className="section-label">Sample lookup</span><h2>Showing sample tracking…</h2><p>Preparing the recorded handoffs.</p></div>
            : outcome.kind === 'missing' ? <div className="empty-paper" role="status"><span className="section-label">No sample match</span><h2>We couldn’t find that sample.</h2><p>Live parcel lookup is not connected yet. Choose a sample number below to explore its history.</p><Button variant="outline" className="border-docket-node-border text-docket-foreground hover:bg-journey-current hover:text-journey-current-foreground focus-visible:outline-docket-foreground" onClick={() => showParcel(sampleParcels[0].number)}>Show an example</Button></div>
              : <div className="empty-paper"><span className="section-label">A delivery, step by step</span><h2>Your parcel’s story starts here.</h2><p>Enter a tracking number, or choose a sample below to see how recorded handoffs appear.</p><ol className="empty-steps"><li>Registered</li><li>Assigned</li><li>Out for delivery</li><li>Final outcome</li></ol></div>}
      </section>
    </div>
    <section className="sample-picker" aria-labelledby="samples-title"><div><h2 id="samples-title">Take a sample journey.</h2><p>Sample parcels. Five different stages.</p></div><div className="sample-list">{sampleParcels.map(item => <Button variant="ghost" className="sample-choice h-auto min-h-16 w-full justify-between rounded-none border-0 border-b px-2 py-3 text-left font-normal" key={item.number} type="button" disabled={outcome.kind === 'loading'} aria-pressed={parcel?.number === item.number} onClick={() => showParcel(item.number)}><span className="sample-number">{item.number}</span><ParcelStatusBadge status={item.status} /></Button>)}</div></section>
  </>;
}
