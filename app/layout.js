import './globals.css';
import localFont from 'next/font/local';
import VisitTracker from '@/components/VisitTracker';

// Vendored locally so builds work offline and the UI does not depend on Google Fonts at build time.
const display = localFont({ src: './fonts/bricolage-grotesque-latin.woff2', variable: '--font-bricolage', weight: '200 800', display: 'swap' });
const body = localFont({ src: './fonts/public-sans-latin.woff2', variable: '--font-public-sans', weight: '100 900', display: 'swap' });

export const metadata = {
  title: {
    default: 'CoopLedger: digital passbooks for cooperative societies',
    template: '%s · CoopLedger',
  },
  description: 'A multi-tenant platform for thrift and credit cooperatives: digital passbooks, online contributions and automatic reconciliation.',
  applicationName: 'CoopLedger',
};

export const viewport = {
  themeColor: '#1A2460',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <VisitTracker />
      </body>
    </html>
  );
}
