import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-lg animate-fadeIn">
        {/* Camera SVG Illustration */}
        <div className="mx-auto mb-8 w-40 h-40 relative">
          <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            {/* Camera body */}
            <rect x="24" y="52" width="112" height="76" rx="12" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
            {/* Lens */}
            <circle cx="80" cy="88" r="24" fill="#e2e8f0" stroke="#3b82f6" strokeWidth="2.5" />
            <circle cx="80" cy="88" r="14" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1.5" />
            <circle cx="80" cy="88" r="6" fill="#3b82f6" opacity="0.3" />
            {/* Flash */}
            <rect x="36" y="60" width="16" height="8" rx="2" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
            {/* Viewfinder */}
            <rect x="56" y="40" width="28" height="14" rx="4" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
            {/* Shutter button */}
            <circle cx="112" cy="46" r="6" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
            {/* X marks */}
            <g stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <line x1="70" y1="80" x2="90" y2="96" />
              <line x1="90" y1="80" x2="70" y2="96" />
            </g>
            {/* Question mark */}
            <text x="132" y="48" fontSize="20" fontWeight="bold" fill="#3b82f6" opacity="0.6">?</text>
          </svg>
        </div>

        {/* 404 Number */}
        <h1 className="font-heading font-bold text-6xl text-brand-black mb-2 tracking-tight">
          4<span className="text-accent-blue">0</span>4
        </h1>

        <h2 className="font-heading font-semibold text-xl text-brand-black mb-3">
          Seite nicht gefunden
        </h2>

        <p className="font-body text-brand-text mb-8 leading-relaxed">
          Die Seite, die du suchst, gibt es leider nicht (mehr).
          <br />
          Vielleicht hilft dir einer dieser Links weiter:
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-black text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Zur Startseite
          </Link>
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 px-6 py-3 border border-brand-border text-brand-black font-heading font-semibold text-sm rounded-btn hover:bg-brand-bg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            Kameras ansehen
          </Link>
          <Link
            href="/kontakt"
            className="inline-flex items-center gap-2 px-6 py-3 border border-brand-border text-brand-text font-body font-medium text-sm rounded-btn hover:bg-brand-bg transition-colors"
          >
            Kontakt
          </Link>
        </div>
      </div>
    </div>
  );
}
