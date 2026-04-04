import Link from 'next/link';

const shopLinks = [
  { href: '/kameras', label: 'Alle Kameras' },
  { href: '/kameras?filter=neu', label: 'Neuheiten' },
  { href: '/kameras?filter=angebot', label: 'Angebote' },
  { href: '/so-funktionierts', label: "So funktioniert's" },
];

const legalLinks = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutzerklärung' },
  { href: '/agb', label: 'AGB' },
  { href: '/widerruf', label: 'Widerrufsbelehrung' },
  { href: '/stornierung', label: 'Stornierungs- & Rückerstattungsbedingungen' },
  { href: '/haftungsbedingungen', label: 'Haftungsbedingungen' },
  { href: '/versand-zahlung', label: 'Versand & Zahlung' },
  { href: '/cookie-richtlinie', label: 'Cookie-Richtlinie (EU)' },
];

const sonstigesLinks = [
  { href: '/blog', label: 'Blog' },
  { href: '/neuigkeiten', label: 'Neuigkeiten' },
];

const supportLinks = [
  { href: '/faq', label: 'FAQ' },
  { href: '/kontakt', label: 'Kontakt' },
];

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-brand-black text-white" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Spalte 1: Logo + Kontakt */}
          <div className="lg:col-span-1">
            <div className="mb-4">
              <span className="font-heading font-bold text-2xl tracking-tight">
                Cam<span className="text-accent-blue">2</span>Rent
              </span>
              <p className="text-[11px] font-body text-brand-muted tracking-wide mt-0.5">
                clever mieten statt kaufen
              </p>
            </div>
            {/* Kontakt-Infos */}
            <div className="mt-1 space-y-1 text-sm font-body text-brand-muted">
              <p className="font-semibold text-white">Cam2Rent</p>
              <p>Lennart Schickel</p>
              <p>Heimsbrunner Str. 12</p>
              <p>12349 Berlin, Deutschland</p>
              <p className="pt-2">
                E-Mail:{' '}
                <a href="mailto:kontakt@cam2rent.de" className="text-accent-blue hover:text-white transition-colors">
                  kontakt@cam2rent.de
                </a>
              </p>
              <p>Telefon: 0162 / 8367477</p>
            </div>

            {/* DSGVO Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-dark rounded-md border border-white/10 mt-4">
              <ShieldCheckIcon />
              <span className="text-xs font-body text-brand-muted">Daten in Deutschland</span>
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-3 mt-5">
              {[
                { icon: <InstagramIcon />, label: 'Instagram', href: 'https://instagram.com/cam2rent' },
                { icon: <YouTubeIcon />, label: 'YouTube', href: 'https://youtube.com/@cam2rent' },
                { icon: <TikTokIcon />, label: 'TikTok', href: 'https://tiktok.com/@cam2rent' },
              ].map(({ icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="p-2 rounded-md bg-brand-dark text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Spalte 2: Shop */}
          <div>
            <h3 className="font-heading font-semibold text-sm text-white uppercase tracking-wider mb-4">
              Shop
            </h3>
            <ul className="space-y-2.5">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-body text-brand-muted hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Spalte 3: Rechtliches */}
          <div>
            <h3 className="font-heading font-semibold text-sm text-white uppercase tracking-wider mb-4">
              Rechtliches
            </h3>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-body text-brand-muted hover:text-white transition-colors leading-snug">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Spalte 4: Sonstiges */}
          <div>
            <h3 className="font-heading font-semibold text-sm text-white uppercase tracking-wider mb-4">
              Sonstiges
            </h3>
            <ul className="space-y-2.5">
              {sonstigesLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-body text-brand-muted hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

          </div>

          {/* Spalte 5: Support */}
          <div>
            <h3 className="font-heading font-semibold text-sm text-white uppercase tracking-wider mb-4">
              Support
            </h3>
            <ul className="space-y-2.5 mb-6">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-body text-brand-muted hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Payment Icons */}
            <p className="text-xs font-body text-brand-muted mb-3 uppercase tracking-wider">Zahlung</p>
            <div className="flex items-center gap-2">
              <div className="bg-white rounded px-2 py-1">
                <svg viewBox="0 0 50 16" className="h-4 w-auto" aria-label="Visa">
                  <text x="0" y="13" fontFamily="Arial" fontWeight="bold" fontSize="14" fill="#1a1f71">VISA</text>
                </svg>
              </div>
              <div className="bg-white rounded px-1 py-1 flex items-center">
                <div className="w-4 h-4 rounded-full bg-red-500 opacity-90" />
                <div className="w-4 h-4 rounded-full bg-yellow-400 -ml-2" />
              </div>
              <div className="bg-[#ffb3c7] rounded px-2 py-1">
                <span className="text-xs font-bold text-black font-body">klarna</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-6 text-center">
          <p className="text-xs font-body text-brand-muted">
            © 2026 Cam2Rent. Alle Rechte vorbehalten.
          </p>
        </div>
      </div>
    </footer>
  );
}
