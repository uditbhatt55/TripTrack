import './style.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Splittrack', description: 'Trip expenses and shared balances' };

export default function Layout({children}: {children: ReactNode}) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}

