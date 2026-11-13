import localFont from 'next/font/local';

export const bodyFont = localFont({
  src: './fonts/DMSans-Variable.ttf', variable: '--font-dm-sans', weight: '100 1000',
  display: 'swap', fallback: ['Segoe UI', 'Arial', 'sans-serif'],
});
export const displayFont = localFont({
  src: './fonts/BarlowCondensed-SemiBold.ttf', variable: '--font-barlow-condensed', weight: '600',
  display: 'swap', fallback: ['Impact', 'Arial Narrow', 'sans-serif'],
});
