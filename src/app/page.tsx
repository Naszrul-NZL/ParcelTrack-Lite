import Link from 'next/link';
import { sampleParcels } from '@/features/preview/sample-parcels';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
export const dynamic='force-dynamic';
export default function Home() {
  const parcel = sampleParcels[0];
  return <div className="page-width home-page">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="hero-copy">
        <h1 id="home-title">Your parcels, <br />in one place.</h1>
        <p className="lead">From the first registration to the final handoff. Keep every parcel and every delivery update together.</p>
        <form action="/track" className="home-track-form">
          <Label htmlFor="home-number">Have a tracking number?</Label>
          <div className="input-action"><Input id="home-number" name="number" required maxLength={64} placeholder="Enter your tracking number" autoComplete="off" spellCheck={false} /><Button className="button" type="submit">Track parcel</Button></div>
        </form>
        <p className="sample-link">Just looking around? <Link href="/track?number=PTL-DEMO-001">Try a sample parcel</Link></p>
      </div>
      <Card className="shipment-label gap-0 py-0 ring-0" role="article" aria-labelledby="sample-title">
        <div className="label-heading"><span id="sample-title">Sample shipment</span><Badge variant="outline" className="sample-marker text-xs font-normal text-muted-foreground">Demo data</Badge></div>
        <div className="label-body"><p className="field-caption">Tracking number</p><p className="tracking-code">{parcel.number}</p>
          <div className="shipment-status"><Badge className="status" variant="active">{parcel.status}</Badge><p>{parcel.description}</p></div>
          <ol className="shipment-progress" aria-label="Sample delivery progress"><li className="complete">Registered</li><li className="complete">Assigned</li><li className="current" aria-current="step">Out for delivery</li><li>Delivered</li></ol>
        </div>
        <div className="label-foot"><div><span className="field-caption">Latest sample update</span><p>{parcel.updated}</p></div><Link href="/track?number=PTL-DEMO-001">View history</Link></div>
      </Card>
    </section>
    <section className="workspace-section" aria-labelledby="workspaces-title">
      <div className="section-intro"><h2 id="workspaces-title">Every handoff has a workspace.</h2><p>One place to prepare a parcel. <br />One place to take it further.</p></div>
      <div className="workspace-options">
        <article><span className="workspace-role">For sellers</span><h3>Send it with a clear record.</h3><p>Register a parcel, keep its tracking number, and follow its delivery history.</p><Link className="text-link" href="/login?workspace=seller">Explore seller sign in</Link></article>
        <article><span className="workspace-role">For riders</span><h3>Know what’s next on your list.</h3><p>See assigned parcels and record progress as each delivery moves forward.</p><Link className="text-link" href="/login?workspace=rider">Explore rider sign in</Link></article>
      </div>
    </section>
    <section className="public-tracking-note"><div><h2>Only here to check a delivery?</h2><p>Public tracking shows parcel status and update times. No sign in needed.</p></div><Link className={cn(buttonVariants({ variant: 'outline' }), 'button')} href="/track">Track a parcel</Link></section>
  </div>;
}
