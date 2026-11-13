import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppNavigation } from '@/components/app-navigation';
import { ThemeProvider, ThemeToggle } from '@/components/theme-provider';
import { bodyFont, displayFont } from './fonts';
import './globals.css';
import './style.css';
export const metadata:Metadata={title:'ParcelTrack Lite',description:'Parcel registration and delivery tracking.',icons:{icon:'data:,'}};
export default async function RootLayout({children}:{children:React.ReactNode}) {
  const theme = (await cookies()).get('ptl_theme')?.value === 'dark' ? 'dark' : 'light';
  return <html lang="en" data-theme={theme} className={`${bodyFont.variable} ${displayFont.variable}${theme === 'dark' ? ' dark' : ''}`}><body><ThemeProvider initialTheme={theme}>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/">ParcelTrack <span>Lite</span></Link>
      <AppNavigation />
      <ThemeToggle />
    </div></header>
    <div className="preview-strip"><div className="page-width"><strong>Sample workspace</strong><span>Explore the interface with sample parcels. Account actions are not connected yet.</span></div></div>
    <main id="main" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><div className="page-width"><div><strong>ParcelTrack Lite</strong><p>Parcel registration and delivery tracking for RapidExpress.</p></div><span>Classroom project / Interface preview</span></div></footer>
  </ThemeProvider></body></html>;
}
