import Link from 'next/link';
import { sampleParcels } from '@/features/preview/sample-parcels';
import { ParcelDocket } from '@/components/parcel-docket';
import { buttonVariants } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default function Home() {
  const parcel = sampleParcels[0];
  return <div className="page-width home-page">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="hero-copy">
        <h1 id="home-title">Your parcels, <br />in one place.</h1>
        <p className="lead">From the first registration to the final handoff. A clear record of every parcel, every step of the way.</p>
        <div className="hero-actions"><Link className={buttonVariants()} href="/track">Track a parcel</Link><Link className="text-link" href="/track?number=PTL-DEMO-001">Try a sample parcel <span aria-hidden="true">↗</span></Link></div>
        <p className="hero-note">Just the status and recorded times.<br />No account needed to check a delivery.</p>
      </div>
      <div className="home-docket"><ParcelDocket trackingNumber={parcel.number} status={parcel.status} history={parcel.history} sample /><Link className="docket-link" href="/track?number=PTL-DEMO-001">View history <span aria-hidden="true">↗</span></Link></div>
    </section>
    <section className="workspace-section" aria-labelledby="workspaces-title">
      <div className="section-intro"><span className="section-label">Behind every delivery</span><h2 id="workspaces-title">A place for<br />every handoff.</h2></div>
      <div className="workspace-options">
        <article><span className="workspace-role">For sellers</span><h3>Give it a good start.</h3><p>Register a parcel, keep its tracking number, and follow each recorded update.</p><Link className="text-link" href="/login?workspace=seller">Explore seller sign in</Link></article>
        <article><span className="workspace-role">For riders</span><h3>Know your next move.</h3><p>See assigned parcels and record progress as each delivery moves forward.</p><Link className="text-link" href="/login?workspace=rider">Explore rider sign in</Link></article>
      </div>
    </section>
    <section className="public-tracking-note"><div><h2>Here for one parcel?</h2><p>Check its status and recorded handoffs.</p></div><Link className={buttonVariants({ variant: 'outline' })} href="/track">Track a parcel</Link></section>
  </div>;
}
