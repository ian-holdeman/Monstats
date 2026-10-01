import type { Metadata } from 'next';
import './globals.css';
import './rows.css';
export const metadata: Metadata = {
  title: 'Monstats · Champions analytics',
  description:
    'Observed tournament performance of registered Pokémon Champions teams.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
