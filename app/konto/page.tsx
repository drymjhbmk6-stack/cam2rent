'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useSearchParams } from 'next/navigation';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

function ReferralSection({ userId }: { userId: string }) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [rewardValue, setRewardValue] = useState(10);
  const [stats, setStats] = useState<{ total: number; completed: number; rewarded: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/referral?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.referralCode) setReferralCode(d.referralCode);
        if (d.rewardValue) setRewardValue(d.rewardValue);
        if (d.stats) setStats(d.stats);
      })
      .catch(() => {});
  }, [userId]);

  if (!referralCode) return null;

  const referralUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/empfehlung/${referralCode}`;

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-[10px] bg-accent-blue-soft dark:bg-accent-blue/10 flex items-center justify-center text-accent-blue">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-brand-black dark:text-white">Freunde einladen</h2>
          <p className="text-xs text-brand-steel dark:text-gray-400">Empfehle cam2rent weiter und erhalte {rewardValue} € Gutschein pro Buchung</p>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <input type="text" readOnly value={referralUrl} className="flex-1 px-3 py-2.5 rounded-[10px] border border-brand-border dark:border-white/10 bg-brand-bg dark:bg-brand-black text-brand-black dark:text-white text-sm font-mono" />
        <button onClick={handleCopy} className="px-4 py-2.5 rounded-[10px] bg-brand-black dark:bg-accent-blue text-white text-sm font-heading font-semibold hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors flex-shrink-0">
          {copied ? 'Kopiert!' : 'Kopieren'}
        </button>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-[10px] bg-brand-bg dark:bg-brand-black">
            <div className="text-lg font-heading font-bold text-brand-black dark:text-white">{stats.total}</div>
            <div className="text-xs text-brand-steel dark:text-gray-400">Einladungen</div>
          </div>
          <div className="text-center p-3 rounded-[10px] bg-brand-bg dark:bg-brand-black">
            <div className="text-lg font-heading font-bold text-brand-black dark:text-white">{stats.completed}</div>
            <div className="text-xs text-brand-steel dark:text-gray-400">Buchungen</div>
          </div>
          <div className="text-center p-3 rounded-[10px] bg-brand-bg dark:bg-brand-black">
            <div className="text-lg font-heading font-bold text-accent-blue">{stats.rewarded * rewardValue} €</div>
            <div className="text-xs text-brand-steel dark:text-gray-400">Verdient</div>
          </div>
        </div>
      )}
    </div>
  );
}

const dashboardCards = [
  {
    href: '/konto/uebersicht',
    title: 'Kontoübersicht',
    description: 'Profil, E-Mail, Passwort und Verifizierung',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    color: 'accent-blue',
  },
  {
    href: '/konto/buchungen',
    title: 'Meine Buchungen',
    description: 'Aktive und vergangene Buchungen einsehen',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    color: 'accent-teal',
  },
  {
    href: '/konto/reklamation',
    title: 'Schaden melden',
    description: 'Schadensmeldung einreichen mit Fotos',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    color: 'accent-amber',
  },
  {
    href: '/konto/feedback',
    title: 'Feedback',
    description: 'Bewertungen und Rückmeldungen verwalten',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    color: 'accent-blue',
  },
  {
    href: '/konto/favoriten',
    title: 'Favoriten',
    description: 'Gemerkte Kameras und Zubehör',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    color: 'accent-teal',
  },
  {
    href: '/konto/nachrichten',
    title: 'Nachrichten',
    description: 'Direkter Kontakt mit dem cam2rent-Team',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    color: 'accent-amber',
  },
  {
    href: '/konto/sets',
    title: 'Eigene Sets',
    description: 'Gespeicherte Sets verwalten und buchen',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    color: 'accent-blue',
  },
];

const colorMap: Record<string, { bg: string; text: string; hoverBg: string }> = {
  'accent-blue': { bg: 'bg-accent-blue-soft dark:bg-accent-blue/10', text: 'text-accent-blue', hoverBg: 'group-hover:bg-accent-blue' },
  'accent-teal': { bg: 'bg-accent-teal-soft dark:bg-accent-teal/10', text: 'text-accent-teal', hoverBg: 'group-hover:bg-accent-teal' },
  'accent-amber': { bg: 'bg-accent-amber-soft dark:bg-accent-amber/10', text: 'text-accent-amber', hoverBg: 'group-hover:bg-accent-amber' },
};

function KontoOverview() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const successMsg = searchParams.get('success');

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'dort';

  // Verifizierungs-Status nachladen, damit wir bei rejected einen
  // Hinweisbanner zeigen koennen mit Link auf den Re-Upload.
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.verification_status) setVerificationStatus(data.verification_status);
      });
  }, [user?.id]);

  return (
    <div className="space-y-6">
      {/* Verifizierung abgelehnt — Hinweisbanner mit Re-Upload-Link */}
      {verificationStatus === 'rejected' && (
        <div className="p-4 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-[10px] bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-status-error">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading font-semibold text-status-error text-sm mb-1">
                Ausweis-Verifizierung abgelehnt
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 mb-3">
                Dein hochgeladener Ausweis konnte nicht freigegeben werden. Bitte lade Vorder- und Rückseite erneut hoch — gut ausgeleuchtet, alle Ecken sichtbar.
              </p>
              <Link
                href="/konto/verifizierung"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-status-error text-white text-xs font-heading font-semibold hover:bg-red-700 transition-colors"
              >
                Ausweis erneut hochladen
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Success messages */}
      {successMsg === 'passwort-geaendert' && (
        <div className="p-4 rounded-[10px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-status-success text-sm">
          Dein Passwort wurde erfolgreich geändert.
        </div>
      )}
      {successMsg === 'profil-gespeichert' && (
        <div className="p-4 rounded-[10px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-status-success text-sm">
          Dein Profil wurde erfolgreich gespeichert.
        </div>
      )}

      {/* Welcome */}
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-1">
          Willkommen, {displayName}!
        </h1>
        <p className="text-brand-text dark:text-gray-300 text-sm">
          Verwalte deine Buchungen, dein Profil und alles rund um dein Konto.
        </p>
      </div>

      {/* Navigation cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboardCards.map((card) => {
          const colors = colorMap[card.color] ?? colorMap['accent-blue'];
          return (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5 hover:shadow-card-hover transition-shadow group"
            >
              <div className={`w-10 h-10 rounded-[10px] ${colors.bg} flex items-center justify-center mb-3 ${colors.text} ${colors.hoverBg} group-hover:text-white transition-colors`}>
                {card.icon}
              </div>
              <h3 className="font-heading font-semibold text-brand-black dark:text-white text-sm mb-1">
                {card.title}
              </h3>
              <p className="text-xs text-brand-steel dark:text-gray-400">{card.description}</p>
            </Link>
          );
        })}
      </div>

      {/* Referral program */}
      {user && <ReferralSection userId={user.id} />}
    </div>
  );
}

export default function KontoPage() {
  return (
    <Suspense>
      <KontoOverview />
    </Suspense>
  );
}
