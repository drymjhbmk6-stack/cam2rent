'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useCart } from '@/components/CartProvider';
import SearchModal from '@/components/SearchModal';

const navLinks = [
  { href: '/', label: 'Startseite' },
  { href: '/kameras', label: 'Kameras' },
  { href: '/so-funktionierts', label: "So funktioniert's" },
  { href: '/blog', label: 'Blog' },
  { href: '/kontakt', label: 'Kontakt' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activePath, setActivePath] = useState('/');
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, signOut, loading } = useAuth();
  const { itemCount } = useCart();

  useEffect(() => {
    setActivePath(window.location.pathname);
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-shadow duration-200 ${
        scrolled ? 'shadow-md' : ''
      } backdrop-blur-md bg-white/80 border-b border-brand-border`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          {/* Logo */}
          <Link href="/" className="flex flex-col leading-tight group">
            <span className="font-heading font-bold text-2xl text-brand-black tracking-tight">
              Cam<span className="text-accent-blue">2</span>Rent
            </span>
            <span className="text-[11px] font-body text-brand-steel tracking-wide -mt-0.5">
              clever mieten statt kaufen
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Hauptnavigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-2 font-body font-medium text-sm transition-colors duration-150 rounded-md group ${
                  activePath === link.href
                    ? 'text-accent-blue'
                    : 'text-brand-text hover:text-brand-black'
                }`}
              >
                {link.label}
                <span
                  className={`absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent-blue transition-transform duration-200 origin-left ${
                    activePath === link.href
                      ? 'scale-x-100'
                      : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </Link>
            ))}
          </nav>

          {/* CTA + Auth + Mobile Toggle */}
          <div className="flex items-center gap-3">
            {!loading && (
              <>
                {user ? (
                  <div className="hidden md:flex items-center gap-2">
                    <Link
                      href="/konto"
                      className={`flex items-center gap-1.5 px-3 py-2 font-body font-medium text-sm rounded-md transition-colors duration-150 ${
                        activePath.startsWith('/konto')
                          ? 'text-accent-blue'
                          : 'text-brand-text hover:text-brand-black'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Konto
                    </Link>
                    <button
                      onClick={signOut}
                      className="px-3 py-2 font-body font-medium text-sm text-brand-steel hover:text-brand-black rounded-md transition-colors duration-150"
                    >
                      Abmelden
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 font-body font-medium text-sm text-brand-text hover:text-brand-black rounded-md transition-colors duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Anmelden
                  </Link>
                )}
              </>
            )}
            {/* Search icon */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-2 text-brand-text hover:text-brand-black transition-colors"
              aria-label="Suche oeffnen (Ctrl+K)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Cart icon */}
            <Link
              href="/warenkorb"
              className="relative p-2 text-brand-text hover:text-brand-black transition-colors"
              aria-label="Warenkorb"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            <Link
              href="/kameras"
              className="hidden md:inline-flex items-center px-4 py-2 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors duration-150"
            >
              Jetzt mieten
            </Link>

            {/* Hamburger */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md text-brand-text hover:text-brand-black hover:bg-brand-bg transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
              aria-expanded={mobileOpen}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        } bg-white border-t border-brand-border`}
      >
        <nav className="px-4 py-4 flex flex-col gap-1" aria-label="Mobile Navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`px-3 py-2.5 rounded-md font-body font-medium text-sm transition-colors ${
                activePath === link.href
                  ? 'text-accent-blue bg-accent-blue-soft'
                  : 'text-brand-text hover:text-brand-black hover:bg-brand-bg'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/kameras"
            onClick={() => setMobileOpen(false)}
            className="mt-2 px-4 py-2.5 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] text-center hover:bg-brand-dark transition-colors"
          >
            Jetzt mieten
          </Link>

          {/* Auth in mobile menu */}
          <div className="mt-2 pt-2 border-t border-brand-border">
            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/konto"
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-md font-body font-medium text-sm transition-colors ${
                        activePath.startsWith('/konto')
                          ? 'text-accent-blue bg-accent-blue-soft'
                          : 'text-brand-text hover:text-brand-black hover:bg-brand-bg'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Mein Konto
                    </Link>
                    <button
                      onClick={() => { setMobileOpen(false); signOut(); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-md font-body font-medium text-sm text-brand-steel hover:text-brand-black hover:bg-brand-bg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Abmelden
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-md font-body font-medium text-sm text-brand-text hover:text-brand-black hover:bg-brand-bg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Anmelden
                  </Link>
                )}
              </>
            )}
          </div>
        </nav>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
