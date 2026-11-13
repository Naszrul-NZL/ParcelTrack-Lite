import type { Metadata } from 'next';
import Link from 'next/link';
import { Navigation } from '@/features/preview/navigation';
import './globals.css';
import './style.css';
export const metadata:Metadata={title:'ParcelTrack Lite',description:'Parcel registration and delivery tracking.',icons:{icon:'data:,'}};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/">ParcelTrack <span>Lite</span></Link>
      <Navigation />
    </div></header>
    <div className="preview-strip"><div className="page-width"><strong>Interface preview</strong><span>Explore sample tracking. Account actions are not connected yet.</span></div></div>
    <main id="main" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><div className="page-width"><div><strong>ParcelTrack Lite</strong><p>Parcel registration and delivery tracking for RapidExpress.</p></div><span>Classroom project / UI preview</span></div></footer>
  </body></html>;
}
