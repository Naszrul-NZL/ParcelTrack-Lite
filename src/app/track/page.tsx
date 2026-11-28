import { TrackPage } from '@/features/parcels/track-page';
export const dynamic = 'force-dynamic';
export default async function Track({ searchParams }: { searchParams: Promise<{ number?: string | string[] }> }) {
  const params = await searchParams;
  // Only the synthetic sample identifiers can be linked. A real tracking number never appears in a URL: lookups use POST.
  const sample = typeof params.number === 'string' && /^PTL-DEMO-00[1-5]$/.test(params.number) ? params.number : '';
  return <div className="page-width tracking-page"><TrackPage key={sample} initialSample={sample} /></div>;
}
