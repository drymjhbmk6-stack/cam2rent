'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

type Tab = 'subscribers' | 'compose' | 'push';

interface SubscriberEntry {
  id: string;
  email: string;
  confirmed: boolean;
  confirmed_at: string | null;
  unsubscribed: boolean;
  unsubscribed_at: string | null;
  source: string | null;
  created_at: string;
  is_test: boolean;
}

interface Stats {
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
}

const FILTER_LABELS: Record<string, string> = {
  all: 'Alle',
  true: 'Bestätigt',
  pending: 'Ausstehend',
  unsubscribed: 'Abgemeldet',
};

export default function NewsletterAdminPage() {
  const [tab, setTab] = useState<Tab>('subscribers');

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminBackLink />
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white">Newsletter</h1>
          <p className="font-body text-sm text-brand-steel dark:text-white/60 mt-1">
            Abonnenten verwalten und Kampagnen versenden
          </p>
        </div>

        <div className="mb-6 flex gap-2 flex-wrap">
          <TabButton current={tab} value="subscribers" label="Abonnenten" onClick={setTab} />
          <TabButton current={tab} value="compose" label="Versand" onClick={setTab} />
          <TabButton current={tab} value="push" label="Kunden-Push" onClick={setTab} />
        </div>

        {tab === 'subscribers' && <SubscribersTab />}
        {tab === 'compose' && <ComposeTab />}
        {tab === 'push' && <CustomerPushTab />}
      </div>
    </div>
  );
}

function CustomerPushTab() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/kameras');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  async function send() {
    setFeedback(null);
    if (!confirm('Push an alle registrierten Kunden-Geräte senden?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/customer-push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, url }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Versand fehlgeschlagen.');
      setFeedback({ kind: 'ok', msg: 'Push wurde an alle Kunden-Geräte verschickt.' });
      setTitle('');
      setBody('');
    } catch (e) {
      setFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Fehler' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white dark:bg-brand-dark rounded-card p-5 border border-brand-border dark:border-white/10 max-w-2xl">
      <h2 className="font-heading font-bold text-base text-brand-black dark:text-white mb-1">Push an Kunden</h2>
      <p className="font-body text-xs text-brand-steel dark:text-white/60 mb-5">
        Geht an alle Kunden-Geräte, die unter Web-Push zugestimmt haben (Banner unten rechts auf der Startseite).
      </p>

      <label className="block font-body text-xs text-brand-steel dark:text-white/60 mb-1">Titel (max 80 Zeichen)</label>
      <input
        type="text"
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="z.B. Neue Insta360 X5 ist da!"
        className="w-full mb-4 px-3 py-2 text-sm bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
      />

      <label className="block font-body text-xs text-brand-steel dark:text-white/60 mb-1">Text (optional)</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 200))}
        rows={3}
        placeholder="Kurze Beschreibung — erscheint unter dem Titel auf dem Sperrbildschirm."
        className="w-full mb-4 px-3 py-2 text-sm bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
      />
      <p className="-mt-3 mb-4 text-[11px] text-right text-brand-steel dark:text-white/40">{body.length}/200</p>

      <label className="block font-body text-xs text-brand-steel dark:text-white/60 mb-1">Klick-Ziel-URL</label>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="/kameras/insta360-x5"
        className="w-full mb-5 px-3 py-2 text-sm bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
      />

      <button
        onClick={send}
        disabled={busy || !title}
        className="w-full px-4 py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-white font-heading font-semibold rounded disabled:opacity-50"
      >
        {busy ? 'Sendet …' : 'Push an alle Kunden senden'}
      </button>

      {feedback && (
        <div
          className={`mt-3 p-3 rounded text-xs font-body ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="mt-5 p-3 rounded bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 text-xs font-body text-brand-steel dark:text-white/60">
        💡 <strong>Tipp:</strong> Spar Push-Notifications für echt relevante Sachen — neue Kameras, Saison-Aktion-Start, Ausverkauf. Zu viele Pushes = Kunde deinstalliert.
      </div>
    </div>
  );
}

function TabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: Tab;
  value: Tab;
  label: string;
  onClick: (t: Tab) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
      style={
        active
          ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }
          : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
      }
    >
      {label}
    </button>
  );
}

function SubscribersTab() {
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ entries: SubscriberEntry[]; total: number; totalPages: number; stats: Stats }>({
    entries: [],
    total: 0,
    totalPages: 1,
    stats: { total: 0, confirmed: 0, pending: 0, unsubscribed: 0 },
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('confirmed', filter);
      if (q) params.set('q', q);
      params.set('page', String(page));
      const res = await fetch(`/api/admin/newsletter/subscribers?${params}`);
      const d = await res.json();
      if (res.ok) setData(d);
    } finally {
      setLoading(false);
    }
  }, [filter, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteEntry(id: string) {
    if (!confirm('Eintrag endgültig löschen?')) return;
    await fetch(`/api/admin/newsletter/subscribers/${id}`, { method: 'DELETE' });
    await load();
  }

  async function toggleUnsub(id: string, current: boolean) {
    await fetch(`/api/admin/newsletter/subscribers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribed: !current }),
    });
    await load();
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Gesamt" value={data.stats.total} />
        <StatCard label="Aktiv" value={data.stats.confirmed} color="#10b981" />
        <StatCard label="Ausstehend" value={data.stats.pending} color="#f59e0b" />
        <StatCard label="Abgemeldet" value={data.stats.unsubscribed} color="#94a3b8" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'true', 'pending', 'unsubscribed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-body transition ${
              filter === f
                ? 'bg-accent-blue text-white'
                : 'bg-white dark:bg-brand-dark text-brand-steel dark:text-white/70 border border-brand-border dark:border-white/10'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="E-Mail suchen…"
          className="ml-auto w-full sm:w-60 px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-brand-dark border border-brand-border dark:border-white/10 text-brand-black dark:text-white"
        />
      </div>

      {loading ? (
        <p className="font-body text-brand-steel dark:text-white/60">Lädt …</p>
      ) : data.entries.length === 0 ? (
        <p className="font-body text-brand-steel dark:text-white/60 py-12 text-center">
          Keine Einträge in dieser Ansicht.
        </p>
      ) : (
        <div className="bg-white dark:bg-brand-dark rounded-card overflow-hidden border border-brand-border dark:border-white/10">
          <table className="w-full text-sm font-body">
            <thead className="bg-brand-bg dark:bg-brand-black">
              <tr>
                <th className="text-left p-3 text-brand-steel dark:text-white/60 text-xs font-medium uppercase">E-Mail</th>
                <th className="text-left p-3 text-brand-steel dark:text-white/60 text-xs font-medium uppercase">Status</th>
                <th className="text-left p-3 text-brand-steel dark:text-white/60 text-xs font-medium uppercase">Quelle</th>
                <th className="text-left p-3 text-brand-steel dark:text-white/60 text-xs font-medium uppercase">Angemeldet</th>
                <th className="text-right p-3 text-brand-steel dark:text-white/60 text-xs font-medium uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-t border-brand-border dark:border-white/10">
                  <td className="p-3 text-brand-black dark:text-white">
                    {e.email}
                    {e.is_test && (
                      <span className="ml-2 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded text-[10px]">
                        TEST
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {e.unsubscribed ? (
                      <span className="text-gray-500 text-xs">Abgemeldet</span>
                    ) : e.confirmed ? (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓ Aktiv</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 text-xs">⏳ Ausstehend</span>
                    )}
                  </td>
                  <td className="p-3 text-brand-steel dark:text-white/60 text-xs">{e.source ?? '—'}</td>
                  <td className="p-3 text-brand-steel dark:text-white/60 text-xs">{fmtDateTime(e.created_at)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggleUnsub(e.id, e.unsubscribed)}
                      className="text-xs text-brand-steel hover:text-accent-blue mr-3"
                    >
                      {e.unsubscribed ? 'Reaktivieren' : 'Abmelden'}
                    </button>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs bg-white dark:bg-brand-dark border border-brand-border dark:border-white/10 rounded disabled:opacity-40"
          >
            ← Zurück
          </button>
          <span className="px-3 py-1.5 text-xs text-brand-steel dark:text-white/60">
            Seite {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 text-xs bg-white dark:bg-brand-dark border border-brand-border dark:border-white/10 rounded disabled:opacity-40"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white dark:bg-brand-dark rounded-card p-4 border border-brand-border dark:border-white/10">
      <p className="text-xs font-body text-brand-steel dark:text-white/60 mb-1">{label}</p>
      <p className="text-2xl font-heading font-bold" style={{ color: color ?? undefined }}>
        {value}
      </p>
    </div>
  );
}

function ComposeTab() {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(
    '<p>Hi,</p>\n<p>Hier kommt dein Newsletter-Inhalt — Links wie <a href="https://cam2rent.de/kameras">Kameras</a>, Bilder, Aktionen.</p>\n<p>Viele Grüße,<br/>cam2rent</p>',
  );
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  async function send(mode: 'test' | 'live') {
    setFeedback(null);
    if (mode === 'live' && !confirm('Wirklich an alle bestätigten Abonnenten senden?')) return;

    setBusy(true);
    try {
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml, mode, testEmail }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Versand fehlgeschlagen.');
      if (mode === 'test') {
        setFeedback({ kind: 'ok', msg: `Test-Mail an ${testEmail} verschickt.` });
      } else {
        setFeedback({
          kind: 'ok',
          msg: `Versand abgeschlossen: ${d.sent}/${d.total} erfolgreich, ${d.failed} fehlgeschlagen.`,
        });
      }
    } catch (e) {
      setFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Fehler' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white dark:bg-brand-dark rounded-card p-5 border border-brand-border dark:border-white/10">
        <h2 className="font-heading font-bold text-base text-brand-black dark:text-white mb-4">Inhalt</h2>

        <label className="block font-body text-xs text-brand-steel dark:text-white/60 mb-1">Betreff</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={100}
          placeholder="z.B. Neue Kameras im Sortiment"
          className="w-full mb-4 px-3 py-2 text-sm bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
        />

        <label className="block font-body text-xs text-brand-steel dark:text-white/60 mb-1">
          Inhalt (HTML erlaubt)
        </label>
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 text-sm font-mono bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
        />

        <p className="mt-2 text-xs font-body text-brand-steel dark:text-white/60">
          Header, Abmelde-Link und Footer werden automatisch ergänzt.
        </p>

        <div className="mt-5 pt-5 border-t border-brand-border dark:border-white/10">
          <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white mb-3">Versand</h3>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Test-Empfänger"
              className="flex-1 px-3 py-2 text-sm bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 rounded text-brand-black dark:text-white"
            />
            <button
              onClick={() => send('test')}
              disabled={busy || !subject || !bodyHtml || !testEmail}
              className="px-4 py-2 bg-brand-bg dark:bg-brand-black border border-brand-border dark:border-white/10 text-brand-black dark:text-white text-sm font-heading font-semibold rounded disabled:opacity-50"
            >
              Test senden
            </button>
          </div>

          <button
            onClick={() => send('live')}
            disabled={busy || !subject || !bodyHtml}
            className="w-full px-4 py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-white font-heading font-semibold rounded disabled:opacity-50"
          >
            {busy ? 'Sendet …' : 'An alle bestätigten Abonnenten senden'}
          </button>

          {feedback && (
            <div
              className={`mt-3 p-3 rounded text-xs font-body ${
                feedback.kind === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}
            >
              {feedback.msg}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-brand-dark rounded-card p-5 border border-brand-border dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-base text-brand-black dark:text-white">Vorschau</h2>
          <button
            onClick={() => setShowPreview((s) => !s)}
            className="text-xs font-body text-accent-blue hover:underline"
          >
            {showPreview ? 'Zuklappen' : 'Vorschau anzeigen'}
          </button>
        </div>

        {showPreview ? (
          <div>
            <div className="mb-2 text-xs font-body text-brand-steel dark:text-white/60">
              <strong>Von:</strong> Cam2Rent &lt;noreply@…&gt;<br />
              <strong>Betreff:</strong> {subject || '—'}
            </div>
            <iframe
              srcDoc={`<html><head><style>body{margin:0;font-family:Arial;}</style></head><body style="padding:16px;background:#fff;color:#1a1a1a;">${bodyHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;"/><p style="font-size:11px;color:#9ca3af;text-align:center;">Cam2Rent · Vom Newsletter abmelden · Datenschutz</p></body></html>`}
              className="w-full h-[400px] bg-white border border-brand-border dark:border-white/10 rounded"
              title="Vorschau"
            />
          </div>
        ) : (
          <p className="text-xs font-body text-brand-steel dark:text-white/60">
            Klicke „Vorschau anzeigen&ldquo;, um den gerenderten Inhalt zu sehen. Der finale Versand
            wird zusätzlich in das cam2rent-Mail-Template (Header + Footer mit Abmelde-Link) gewrappt.
          </p>
        )}
      </div>
    </div>
  );
}
