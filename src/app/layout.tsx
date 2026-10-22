import type { Metadata } from 'next';
import Link from 'next/link';
import './style.css';
export const metadata:Metadata={title:'ParcelTrack Lite',description:'Parcel registration and delivery tracking.'};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header><Link className="brand" href="/">ParcelTrack Lite</Link><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/track">Track a parcel</Link><Link href="/login">Sign in</Link></nav></header><main id="main" tabIndex={-1}>{children}</main><footer>ParcelTrack Lite · RapidExpress</footer></body></html>;
}
