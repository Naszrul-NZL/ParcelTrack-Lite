import { TrackingPanel } from '@/features/preview/tracking-panel';
export const dynamic = 'force-dynamic';
export default async function Track({ searchParams }: { searchParams: Promise<{ number?: string | string[] }> }) {
  const params = await searchParams;
  // Only known synthetic identifiers can be linked. Real tracking stays out of URLs.
  const number = typeof params.number === 'string' && /^PTL-DEMO-00[1-5]$/.test(params.number) ? params.number : '';
  return <div className="page-width tracking-page"><TrackingPanel key={number} initialNumber={number} /></div>;
}
