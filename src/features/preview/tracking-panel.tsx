'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findSampleParcel, sampleParcels, statusVariant, type SampleParcel } from './sample-parcels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  return <div className="tracking-layout">
      <form className="tracking-form surface" onSubmit={submit} noValidate>
        <h2>Find your parcel</h2><Label htmlFor="tracking-number">Tracking number</Label>
        <Input ref={input} id="tracking-number" value={number} onChange={event => setNumber(event.target.value)} maxLength={64} placeholder="e.g. PTL-DEMO-001" autoComplete="off" spellCheck={false} aria-describedby={outcome.kind === 'invalid' ? 'number-error' : 'number-help'} aria-invalid={outcome.kind === 'invalid'} />
        {outcome.kind === 'invalid' ? <p className="field-error" id="number-error" role="alert">Enter a tracking number to continue.</p> : <p className="field-help" id="number-help">You can find this on your parcel registration record.</p>}
        <Button className="button" type="submit" disabled={outcome.kind === 'loading'}>{outcome.kind === 'loading' ? 'Showing sample…' : 'Track parcel'}</Button>
      </form>
    <section className="tracking-result surface" ref={result} tabIndex={-1} aria-label="Tracking result" aria-busy={outcome.kind === 'loading'}>
      {outcome.kind === 'found' ? <>
        <div className="result-heading"><span className="field-caption">Sample tracking result</span><Badge variant="outline" className="sample-marker text-xs font-normal text-muted-foreground">Demo data</Badge></div>
        <h2 className="result-number">{outcome.parcel.number}</h2><Badge className="status" variant={statusVariant(outcome.parcel.status)}>{outcome.parcel.status}</Badge><p className="result-description">{outcome.parcel.description}</p>
        <div className="history-heading"><h3>Delivery history</h3><span>Sample times, Malaysia time</span></div>
        <ol className="history-list">{outcome.parcel.events.map((event, index) => <li key={event.status} className={index === 0 ? 'latest' : ''}><div className="history-event"><h4>{event.status}</h4><span>{event.time}</span></div><p>{event.description}</p></li>)}</ol>
        <p className="result-note">Public tracking shows status and timestamps only. Recipient details stay out of this view.</p>
      </> : outcome.kind === 'loading' ? <div className="result-empty" role="status"><span className="loading-mark" aria-hidden="true" /><h2>Showing sample tracking…</h2><p>Preparing the preview timeline.</p></div>
        : outcome.kind === 'missing' ? <div className="result-empty" role="status"><span className="empty-label">No sample match</span><h2>We couldn’t find that sample.</h2><p>Live parcel lookup is not connected yet. Choose one of the sample numbers to explore a delivery history.</p><Button className="button" variant="outline" onClick={() => showParcel(sampleParcels[0].number)}>Show an example</Button></div>
          : <div className="result-empty"><span className="empty-label">A delivery, step by step</span><h2>Your parcel’s story starts here.</h2><p>Enter a tracking number to see its status and delivery history. Use a sample to explore this preview.</p><ol className="empty-steps"><li>Registered</li><li>Assigned</li><li>Out for delivery</li><li>Delivered</li></ol></div>}
    </section>
    <section className="sample-picker" aria-labelledby="samples-title"><h2 id="samples-title">Try a sample</h2><p>This preview uses sample parcels only.</p><div>{sampleParcels.map(parcel => <Button variant="ghost" className="sample-choice h-auto min-h-12 justify-between rounded-none border-0 border-t border-border px-0 py-4 text-xs font-normal text-muted-foreground last:border-b" key={parcel.number} type="button" disabled={outcome.kind === 'loading'} onClick={() => showParcel(parcel.number)}><span className="sample-number">{parcel.number}</span><span>{parcel.status}</span></Button>)}</div></section>
  </div>;
}
