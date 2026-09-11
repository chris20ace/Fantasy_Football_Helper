import type { Metadata } from 'next';
import './globals.css';
import './desk.css';
import './accounts.css';
import './responsive.css';
import './team-management.css';
import './matchup.css';
import './roster-construction.css';
export const metadata: Metadata = {
  title: 'Sunday Desk | Your weekly fantasy edge',
  description: 'Your private fantasy football lineup and league workspace.',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
};
export const viewport = { themeColor: '#111f36' };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
