'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ReferralLandingPage() {
  const params = useParams();
  const code = params.code as string;

  useEffect(() => {
    if (code) {
      sessionStorage.setItem('cam2rent_referral_code', code);
    }
  }, [code]);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Logo */}
        <div className="mb-8">
          <span className="font-heading font-black text-3xl tracking-tight text-brand-black">
            cam<span className="text-accent-blue">2</span>rent
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-card shadow-card p-8 mb-6">
          <div className="text-5xl mb-4">🎁</div>
          <h1 className="font-heading font-bold text-2xl text-brand-black mb-3">
            Du wurdest eingeladen!
          </h1>
          <p className="text-brand-steel text-sm leading-relaxed mb-6">
            Jemand hat dir cam2rent empfohlen. Miete deine erste Action-Cam und
            dein Freund bekommt einen Gutschein als Dankeschön.
          </p>

          <Link
            href="/produkte"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-black text-white font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors"
          >
            Kameras entdecken
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <p className="text-xs text-brand-muted">
          Dein Empfehlungscode <strong className="font-mono">{code}</strong> wurde gespeichert
          und wird automatisch bei deiner ersten Buchung angewendet.
        </p>
      </div>
    </div>
  );
}
