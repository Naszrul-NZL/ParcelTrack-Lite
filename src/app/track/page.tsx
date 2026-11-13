import { TrackingPanel } from '@/features/preview/tracking-panel';
export const dynamic='force-dynamic';
export default async function Track({ searchParams }: { searchParams: Promise<{ number?: string | string[] }> }) {
  const params = await searchParams;
  const number = typeof params.number === 'string' ? params.number.slice(0, 64) : '';
  return <div className="page-width tracking-page"><div className="page-heading"><h1>Track a parcel</h1><p className="lead">Follow the latest status, from registration to delivery.</p></div><TrackingPanel key={number} initialNumber={number} /></div>;
}
