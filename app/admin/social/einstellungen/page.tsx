'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface SocialAccount {
  id: string;
  platform: 'facebook' | 'instagram';
  external_id: string;
  name: string;
  username?: string | null;
  picture_url?: string | null;
  token_expires_at?: string | null;
  linked_account_id?: string | null;
  is_active: boolean;
  last_used_at?: string | null;
  created_at: string;
}

export default function SocialConnections() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/social/accounts');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fehler beim Laden');
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Query-Parameter auswerten (OAuth-Callback)
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') setNotice('Konto erfolgreich verbunden.');
    if (params.get('error')) setError('Verbindung fehlgeschlagen: ' + params.get('error'));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/social/oauth?action=start');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fehler');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setConnecting(false);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm('Konto wirklich trennen? Geplante Posts dieses Kontos werden nicht mehr veröffentlicht.')) return;
    const res = await fetch(`/api/admin/social/oauth?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } else {
      alert('Trennen fehlgeschlagen.');
    }
  }

  const fbAccounts = accounts.filter((a) => a.platform === 'facebook');
  const igAccounts = accounts.filter((a) => a.platform === 'instagram');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">Social Media — Verbindungen</h1>
      <p className="text-sm text-slate-400 mb-6">
        Verbinde deine Facebook-Seite + Instagram Business Account, damit cam2rent automatisch posten kann.
      </p>

      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-900/30 border border-emerald-700 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Connect-Box */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-6">
        <h2 className="font-semibold text-white mb-2">Neues Konto verbinden</h2>
        <p className="text-sm text-slate-400 mb-4">
          Klick unten und logge dich mit dem Facebook-Account ein, der Admin eurer cam2rent-Seite ist.
          Alle mit diesem Account verknüpften FB-Pages + Instagram-Business-Accounts werden automatisch
          verbunden.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 disabled:opacity-50"
        >
          {connecting ? 'Wird umgeleitet…' : 'Mit Facebook verbinden'}
        </button>
        <p className="text-xs text-slate-500 mt-3">
          Hinweis: Solange die App noch in Development-Mode bei Meta ist, können sich nur App-Admins +
          Tester verbinden. Nach der App-Review ist das öffentlich nutzbar.
        </p>
      </div>

      {loading && <p className="text-slate-400">Lade Konten…</p>}

      {!loading && accounts.length === 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
          <p className="text-slate-400">Noch keine Konten verbunden.</p>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="space-y-6">
          {fbAccounts.length > 0 && (
            <section>
              <h2 className="font-semibold text-white mb-3">Facebook-Seiten</h2>
              <div className="space-y-2">
                {fbAccounts.map((a) => (
                  <AccountRow key={a.id} account={a} onDisconnect={handleDisconnect} />
                ))}
              </div>
            </section>
          )}

          {igAccounts.length > 0 && (
            <section>
              <h2 className="font-semibold text-white mb-3">Instagram Business Accounts</h2>
              <div className="space-y-2">
                {igAccounts.map((a) => (
                  <AccountRow key={a.id} account={a} onDisconnect={handleDisconnect} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="mt-8 rounded-xl bg-slate-900/50 border border-slate-800 p-5">
        <h2 className="font-semibold text-white mb-3">Voraussetzungen</h2>
        <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
          <li>Env-Variablen in Coolify gesetzt: <code className="text-cyan-400">META_APP_ID</code>, <code className="text-cyan-400">META_APP_SECRET</code></li>
          <li>Redirect-URI in der Meta-App hinterlegt: <code className="text-cyan-400">https://cam2rent.de/api/admin/social/oauth</code></li>
          <li>Instagram-Account als Business-Konto + mit FB-Page verknüpft</li>
          <li>Für den produktiven Betrieb: Business-Verifizierung + App-Review bei Meta</li>
        </ul>
      </div>
    </div>
  );
}

function AccountRow({ account, onDisconnect }: { account: SocialAccount; onDisconnect: (id: string) => void }) {
  const tokenExpired = account.token_expires_at ? new Date(account.token_expires_at) < new Date() : false;
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
      {account.picture_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.picture_url} alt="" className="w-10 h-10 rounded-full" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-bold">
          {account.platform === 'facebook' ? 'FB' : 'IG'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate">{account.name}</p>
        <p className="text-xs text-slate-400 truncate">
          {account.username ? `@${account.username}` : `ID: ${account.external_id}`}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {tokenExpired ? (
            <span className="text-red-400">Token abgelaufen — bitte neu verbinden</span>
          ) : account.last_used_at ? (
            `Zuletzt benutzt: ${fmtDateTime(account.last_used_at)}`
          ) : (
            'Noch nicht verwendet'
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDisconnect(account.id)}
        className="text-xs text-red-400 hover:text-red-300"
      >
        Trennen
      </button>
    </div>
  );
}
