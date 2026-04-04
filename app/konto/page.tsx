'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useSearchParams } from 'next/navigation';

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
    <div className="bg-white rounded-card shadow-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-[10px] bg-accent-blue-soft flex items-center justify-center text-accent-blue">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-brand-black">
            Freunde einladen
          </h2>
          <p className="text-xs text-brand-steel">
            Empfehle cam2rent weiter und erhalte {rewardValue} € Gutschein pro Buchung
          </p>
        </div>
      </div>

      {/* Referral link */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          readOnly
          value={referralUrl}
          className="flex-1 px-3 py-2.5 rounded-[10px] border border-brand-border bg-brand-bg text-brand-black text-sm font-mono"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2.5 rounded-[10px] bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors flex-shrink-0"
        >
          {copied ? 'Kopiert!' : 'Kopieren'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-[10px] bg-brand-bg">
            <div className="text-lg font-heading font-bold text-brand-black">{stats.total}</div>
            <div className="text-xs text-brand-steel">Einladungen</div>
          </div>
          <div className="text-center p-3 rounded-[10px] bg-brand-bg">
            <div className="text-lg font-heading font-bold text-brand-black">{stats.completed}</div>
            <div className="text-xs text-brand-steel">Buchungen</div>
          </div>
          <div className="text-center p-3 rounded-[10px] bg-brand-bg">
            <div className="text-lg font-heading font-bold text-accent-blue">{stats.rewarded * rewardValue} €</div>
            <div className="text-xs text-brand-steel">Verdient</div>
          </div>
        </div>
      )}
    </div>
  );
}

function KontoOverview() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const successMsg = searchParams.get('success');

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'dort';

  const quickLinks = [
    {
      href: '/konto/buchungen',
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
      title: 'Meine Buchungen',
      description: 'Aktive und vergangene Buchungen einsehen',
    },
    {
      href: '/konto/profil',
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
      title: 'Profil bearbeiten',
      description: 'Name, Adresse und Telefonnummer anpassen',
    },
    {
      href: '/kameras',
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      title: 'Kamera mieten',
      description: 'Alle Action-Cams entdecken und buchen',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Success message */}
      {successMsg === 'passwort-geaendert' && (
        <div className="p-4 rounded-[10px] bg-green-50 border border-green-200 text-status-success text-sm">
          Dein Passwort wurde erfolgreich geändert.
        </div>
      )}
      {successMsg === 'profil-gespeichert' && (
        <div className="p-4 rounded-[10px] bg-green-50 border border-green-200 text-status-success text-sm">
          Dein Profil wurde erfolgreich gespeichert.
        </div>
      )}

      {/* Welcome */}
      <div className="bg-white rounded-card shadow-card p-6">
        <h1 className="font-heading font-bold text-2xl text-brand-black mb-1">
          Hallo, {displayName}!
        </h1>
        <p className="text-brand-text text-sm">
          Hier kannst du deine Buchungen verwalten und dein Profil bearbeiten.
        </p>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black mb-4">
          Kontoinformationen
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-brand-border">
            <span className="text-sm text-brand-steel">E-Mail</span>
            <span className="text-sm font-medium text-brand-black">
              {user?.email}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-brand-border">
            <span className="text-sm text-brand-steel">Name</span>
            <span className="text-sm font-medium text-brand-black">
              {user?.user_metadata?.full_name || (
                <Link
                  href="/konto/profil"
                  className="text-accent-blue hover:underline"
                >
                  Jetzt eintragen
                </Link>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-brand-steel">Konto erstellt</span>
            <span className="text-sm font-medium text-brand-black">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })
                : '–'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid sm:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white rounded-card shadow-card p-5 hover:shadow-card-hover transition-shadow group"
          >
            <div className="w-10 h-10 rounded-[10px] bg-accent-blue-soft flex items-center justify-center mb-3 text-accent-blue group-hover:bg-accent-blue group-hover:text-white transition-colors">
              {link.icon}
            </div>
            <h3 className="font-heading font-semibold text-brand-black text-sm mb-1">
              {link.title}
            </h3>
            <p className="text-xs text-brand-steel">{link.description}</p>
          </Link>
        ))}
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
