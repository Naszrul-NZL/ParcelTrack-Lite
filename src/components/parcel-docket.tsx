import type { ParcelStatus } from '@/shared/constants';
import { PARCEL_PRESENTATION, formatParcelTime, type ParcelJourneyEvent } from '@/shared/parcel-presentation';
import { cn } from '@/lib/utils';

export type ParcelDocketProps = {
  trackingNumber: string;
  status: ParcelStatus;
  history: readonly ParcelJourneyEvent[];
  sample?: boolean;
  className?: string;
};

export function ParcelDocket({ trackingNumber, status, history, sample = false, className }: ParcelDocketProps) {
  const stages: ParcelStatus[] = ['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY', status === 'FAILED' ? 'FAILED' : 'DELIVERED'];
  const currentIndex = stages.indexOf(status);

  return <article className={cn('parcel-docket', className)} aria-label={`${sample ? 'Sample ' : ''}parcel docket ${trackingNumber}`}>
    <div className="docket-heading"><span>Delivery docket</span><span>{sample ? 'Sample record' : 'Parcel record'}</span></div>
    <div className="docket-identity"><span className="docket-caption">Tracking number</span><h2>{trackingNumber}</h2><p>{PARCEL_PRESENTATION[status].label}</p></div>
    <div className="docket-perforation" aria-hidden="true" />
    <ol className="docket-journey" aria-label="Parcel journey">
      {stages.map((stage, index) => {
        const event = history.filter(item => item.status === stage).toSorted((a, b) => b.changedAt.localeCompare(a.changedAt))[0];
        const current = stage === status;
        const recorded = !!event;
        return <li key={stage} className={cn(current && 'current', recorded && 'recorded', stage === 'FAILED' && 'failed')} aria-current={current ? 'step' : undefined}>
          <span className="docket-node" aria-hidden="true">{recorded && index < currentIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>
          <div><h3>{PARCEL_PRESENTATION[stage].label}</h3>{event ? <time dateTime={event.changedAt}>{formatParcelTime(event.changedAt)}</time> : <span className="docket-pending">Pending</span>}</div>
        </li>;
      })}
    </ol>
    <p className="docket-foot">{sample ? 'Sample parcel · Malaysia time' : 'Recorded updates · Malaysia time'}</p>
  </article>;
}
