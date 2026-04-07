'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

const navItems = [
  { href: '/konto', label: 'Übersicht', exact: true },
  { href: '/konto/uebersicht', label: 'Kontoübersicht' },
  { href: '/konto/buchungen', label: 'Buchungen' },
  { href: '/konto/reklamation', label: 'Schaden melden' },
  { href: '/konto/feedback', label: 'Feedback' },
  { href: '/konto/favoriten', label: 'Favoriten' },
  { href: '/konto/nachrichten', label: 'Nachrichten' },
  { href: '/konto/sets', label: 'Eigene Sets' },
];

export default function KontoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Horizontale Menüleiste */}
        <nav className="bg-white dark:bg-brand-dark rounded-card shadow-card mb-6 overflow-hidden">
          <div className="flex items-center overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 p-2 min-w-0">
              {navItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap px-3.5 py-2 rounded-[8px] text-sm font-body font-medium transition-colors ${
                      isActive
                        ? 'bg-accent-blue-soft dark:bg-accent-blue/10 text-accent-blue'
                        : 'text-brand-text dark:text-gray-400 hover:text-brand-black dark:hover:text-white hover:bg-brand-bg dark:hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="ml-auto pr-2 flex-shrink-0">
              <button
                onClick={signOut}
                className="whitespace-nowrap px-3.5 py-2 rounded-[8px] text-sm font-body font-medium text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white hover:bg-brand-bg dark:hover:bg-white/5 transition-colors"
              >
                Abmelden
              </button>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main>{children}</main>
      </div>
    </div>
  );
}
