import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corporate Carpool Platform | Enterprise Commute Sharing',
  description: 'Enterprise corporate carpooling solution with corridor matching and atomic seat reservations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
