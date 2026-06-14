'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ExpressSignup from '@/components/checkout/ExpressSignup';
import { useAuth } from '@/components/AuthProvider';

/**
 * Registrierungs-Seite — nutzt den gleichen ExpressSignup-Flow wie Checkout
 * und der Direkt-Buchungsflow. Damit gibt es eine einheitliche UX für die
 * Konto-Erstellung inkl. Adresse + Ausweis-Upload.
 *
 * Hinweis: Der Flow nutzt `email_confirm: true`, d.h. es wird keine
 * Bestätigungs-E-Mail mehr verschickt — der Kunde kann sich nach Abschluss
 * direkt einloggen. Spam-Schutz: Rate-Limit 5/h pro IP.
 */
export default function RegistrierungPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegistrierungInner />
    </Suspense>
  );
}

// Sweep 8 H11: Open-Redirect-Schutz analog Login.
function safeRedirect(raw: string | null | undefined, fallback = '/konto'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/^\s*javascript:/i.test(raw) || /^\s*data:/i.test(raw)) return fallback;
  return raw;
}

function RegistrierungInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const { user, loading } = useAuth();

  // Sobald der Signup/Login-Flow in ExpressSignup startet, darf der
  // „schon eingeloggt → weiterleiten"-Effekt NICHT mehr feuern — sonst
  // springt die Seite nach dem Auto-Login direkt ins Konto und überspringt
  // den Pflicht-Ausweis-Upload (Upload-Feld blitzt nur kurz auf).
  const [authStarted, setAuthStarted] = useState(false);

  // Bereits eingeloggte User (vor Signup-Beginn) direkt weiterleiten
  useEffect(() => {
    if (!loading && user && !authStarted) {
      router.replace(redirectTo);
    }
  }, [user, loading, router, redirectTo, authStarted]);

  const [done, setDone] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
              Willkommen bei cam2rent!
            </h1>
            <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
              Dein Konto ist angelegt. Du wirst gleich zu deinem Konto weitergeleitet…
            </p>
            <button
              type="button"
              onClick={() => router.push(redirectTo)}
              className="text-accent-blue hover:underline font-medium text-sm"
            >
              Jetzt zum Konto
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="font-heading font-bold text-2xl text-brand-black dark:text-white">
              Cam<span className="text-accent-blue">2</span>Rent
            </span>
          </Link>
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mt-6 mb-1">
            Konto erstellen
          </h1>
          <p className="text-brand-text dark:text-gray-300 text-sm">
            Adresse eintragen, Ausweis hochladen — fertig.
          </p>
        </div>

        <ExpressSignup
          requireUpload
          onAuthCompleted={() => setAuthStarted(true)}
          onAuthenticated={() => {
            setDone(true);
            // Kurze Pause, damit der "Willkommen"-Screen sichtbar ist.
            setTimeout(() => router.push(redirectTo), 1200);
          }}
        />

        <p className="text-center text-sm text-brand-steel dark:text-gray-400 mt-6">
          Bereits ein Konto?{' '}
          <Link href={`/login${redirectTo !== '/konto' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`} className="text-accent-blue hover:underline font-medium">
            Jetzt anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
