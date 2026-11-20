import './globals.css';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import VisitTracker from '@/components/VisitTracker';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

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
