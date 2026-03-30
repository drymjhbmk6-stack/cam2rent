'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

  useEffect(() => {
    setActivePath(window.location.pathname);
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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

          {/* CTA + Mobile Toggle */}
          <div className="flex items-center gap-3">
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
        </nav>
      </div>
    </header>
  );
}
