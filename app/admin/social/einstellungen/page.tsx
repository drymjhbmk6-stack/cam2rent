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

      {/* Auto-Post-Einstellungen */}
      <AutoPostSettings />

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

interface AutoPostSettingsData {
  auto_post_mode?: 'draft' | 'scheduled' | 'published';
  auto_post_delay_minutes?: number;
  enabled_triggers?: Record<string, boolean>;
  default_tone?: string;
  ki_context?: string;
  default_hashtags?: string[];
}

function AutoPostSettings() {
  const [settings, setSettings] = useState<AutoPostSettingsData>({ auto_post_mode: 'draft', auto_post_delay_minutes: 30 });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/social/settings')
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? {}));
  }, []);

  function update<K extends keyof AutoPostSettingsData>(key: K, value: AutoPostSettingsData[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleTrigger(trigger: string) {
    const prev = settings.enabled_triggers ?? {};
    update('enabled_triggers', { ...prev, [trigger]: !(prev[trigger] ?? true) });
  }

  async function save() {
    setBusy(true);
    await fetch('/api/admin/social/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function loadRecommended() {
    if (settings.default_tone || settings.ki_context || (settings.default_hashtags ?? []).length > 0) {
      if (!confirm('Vorhandene Einstellungen mit Empfehlungen überschreiben?')) return;
    }
    setSettings((prev) => ({
      ...prev,
      default_tone: 'Locker und authentisch, Duzen, 2-4 Emojis. Sprich Outdoor-/Action-Fans an ohne Werbefloskeln. Wenn du Zahlen/Preise/Eigenschaften nennst: klar und konkret, keine Superlativ-Inflation.',
      ki_context: `UNTERNEHMEN:
cam2rent.de ist ein deutscher Action-Cam-Verleih. Wir vermieten GoPro, DJI, Insta360 und Zubehör ab 1 Tag, mit Versand deutschlandweit oder Abholung.

USPs (immer einbaubar):
- Ab 1 Tag mietbar, flexibel bis 30+ Tage
- Haftungsschutz ab 15€ (NIEMALS "Versicherung" sagen)
- Versand deutschlandweit, Express möglich
- Geprüft und gereinigt vor jedem Versand
- Persönliche Beratung per WhatsApp

STILISTISCH:
- Duzen statt Siezen
- Umlaute korrekt schreiben (ä ö ü)
- Am Ende jedes Posts CTA (z.B. "Jetzt mieten auf cam2rent.de", "Link in der Bio", "Schreibt uns eure Meinung")
- Variiere die CTAs zwischen Posts
- Keine Hashtags im Fließtext — die kommen separat

FRISCHE GEWÄHRLEISTEN:
- Niemals zwei aufeinander folgende Posts zum selben Thema
- Saison beachten: im Winter Ski/Snowboard/Indoor, im Sommer Surfen/Wandern/Festival
- Spezifische Szenarien statt Allgemeinplätze ("GoPro im Nebel am Brocken" > "Action-Cam in der Natur")

AKTUELLE THEMEN (bei Bedarf mal einbauen):
- Neue Modelle: GoPro Hero 14, DJI Osmo Action 7, Insta360 Ace Pro 3 — Release-Erwartungen
- Saison: [aktuell eintragen, z.B. "Sommer-Urlaubssaison beginnt"]
- Aktionen: [aktuell eintragen, z.B. "10% Rabatt mit Code SUMMER26"]`,
      default_hashtags: ['#cam2rent', '#kameramieten', '#actioncam', '#gopro', '#dji', '#insta360'],
    }));
    setSaved(false);
  }

  const triggers: Array<{ key: string; label: string }> = [
    { key: 'blog_publish', label: 'Blog-Artikel veröffentlicht' },
    { key: 'product_added', label: 'Neue Kamera angelegt' },
    { key: 'set_added', label: 'Neues Set angelegt' },
    { key: 'voucher_created', label: 'Neuer Gutschein erstellt' },
  ];

  return (
    <div className="mt-8 rounded-xl bg-slate-900/50 border border-slate-800 p-5">
      <h2 className="font-semibold text-white mb-3">Auto-Posting-Einstellungen</h2>
      <p className="text-sm text-slate-400 mb-4">
        Bestimmt, was passiert wenn ein Ereignis einen Social-Post auslöst (z.B. neuer Blogartikel).
      </p>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Modus</label>
      <select
        value={settings.auto_post_mode ?? 'draft'}
        onChange={(e) => update('auto_post_mode', e.target.value as 'draft' | 'scheduled' | 'published')}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      >
        <option value="draft">Nur Entwurf — Admin muss freigeben</option>
        <option value="scheduled">Planen — automatisch posten nach Verzögerung</option>
        <option value="published">Sofort posten — ohne Freigabe</option>
      </select>

      {settings.auto_post_mode === 'scheduled' && (
        <>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Verzögerung (Minuten)</label>
          <input
            type="number"
            min={1}
            max={1440}
            value={settings.auto_post_delay_minutes ?? 30}
            onChange={(e) => update('auto_post_delay_minutes', Number(e.target.value))}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
          />
          <p className="text-xs text-slate-500 mb-3">
            Der Post wird N Minuten nach dem Trigger auf „geplant“ gesetzt. Der Cron veröffentlicht ihn dann.
          </p>
        </>
      )}

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Aktive Trigger</label>
      <div className="space-y-2 mb-6">
        {triggers.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled_triggers?.[t.key] !== false}
              onChange={() => toggleTrigger(t.key)}
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="h-px bg-slate-800 mb-5" />

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-white">KI-Konfiguration</h3>
        <button
          type="button"
          onClick={loadRecommended}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-medium text-xs hover:bg-slate-700 border border-slate-700"
          title="Fuellt die Felder mit optimalen cam2rent-Vorgaben"
        >
          ⚡ Empfohlene Einstellungen laden
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Diese Einstellungen nutzt Claude bei jeder automatisch generierten Caption
        (Neuer Post, Plan-Generator, Auto-Trigger).
      </p>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Standard-Ton</label>
      <input
        type="text"
        value={settings.default_tone ?? ''}
        onChange={(e) => update('default_tone', e.target.value)}
        placeholder="z.B. locker, mit Action-Cam-Insider-Slang und 2-4 Emojis"
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Zusatz-Kontext für die KI</label>
      <textarea
        value={settings.ki_context ?? ''}
        onChange={(e) => update('ki_context', e.target.value)}
        rows={8}
        placeholder={`Aktuelle Themen und Aktionen, die die KI einbauen soll. Zum Beispiel:

- Neue Kameras: GoPro Hero 14 ab Mai, Insta360 Ace Pro 3 Leak
- Aktuelle Aktion: Sommer-Rabatt 10% mit Code SUMMER26
- USPs: Versand deutschlandweit, Haftungsschutz ab 15€, 1-Tag-Miete möglich
- Stilistische Hinweise: Duzen, keine Werbe-Floskeln`}
        className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono text-xs"
      />
      <p className="text-xs text-slate-500 mb-4">
        Wird der KI bei jeder Generierung mitgegeben — für aktuelle Produkte, Preise, Aktionen etc.
        Die Kameras aus deinem Shop werden automatisch geladen.
      </p>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
        Globale Standard-Hashtags (immer mitgepostet)
      </label>
      <input
        type="text"
        value={(settings.default_hashtags ?? []).join(' ')}
        onChange={(e) => {
          const list = e.target.value.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`));
          update('default_hashtags', list);
        }}
        placeholder="#cam2rent #kameramieten #actioncam"
        className="w-full mb-5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? 'Speichere…' : 'Speichern'}
        </button>
        {saved && <span className="text-sm text-emerald-400">✓ Gespeichert</span>}
      </div>
    </div>
  );
}
