'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface LegalDoc {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
  currentVersion: {
    version_number: number;
    change_note: string | null;
    published_at: string;
  } | null;
}

const SLUG_LABELS: Record<string, { icon: string; color: string }> = {
  agb: { icon: '📋', color: '#06b6d4' },
  widerruf: { icon: '↩️', color: '#8b5cf6' },
  haftungsausschluss: { icon: '🛡️', color: '#f59e0b' },
  datenschutz: { icon: '🔒', color: '#22c55e' },
  impressum: { icon: '🏢', color: '#3b82f6' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function LegalDocumentsContent() {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleExportPrompt() {
    setPromptLoading(true);
    try {
      const res = await fetch('/api/admin/legal/export-prompt');
      if (res.ok) {
        const data = await res.json();
        setPromptText(data.prompt);
      }
    } finally {
      setPromptLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    fetch('/api/admin/legal')
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück zum Dashboard" href="/admin" />

        <div className="flex items-center gap-3 mb-8">
          <h1 className="font-heading font-bold text-xl text-white">Rechtliche Dokumente</h1>
          <span className="text-xs font-body px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
            CMS
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ background: '#111827', borderColor: '#1e293b' }}>
            <p className="text-gray-400 font-body text-sm mb-2">Keine Dokumente gefunden.</p>
            <p className="text-gray-500 font-body text-xs">
              Bitte führe die SQL-Migration <code className="px-1.5 py-0.5 rounded text-cyan-400" style={{ background: '#1e293b' }}>supabase/legal-documents.sql</code> aus.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const meta = SLUG_LABELS[doc.slug] ?? { icon: '📄', color: '#94a3b8' };
              return (
                <Link
                  key={doc.id}
                  href={`/admin/legal/${doc.slug}`}
                  className="flex items-center gap-4 p-5 rounded-2xl border transition-all hover:scale-[1.005]"
                  style={{
                    background: '#111827',
                    borderColor: '#1e293b',
                    textDecoration: 'none',
                  }}
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                    style={{ background: `${meta.color}15` }}>
                    {meta.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-sm text-white truncate">{doc.title}</p>
                    <p className="text-xs font-body text-gray-500 mt-0.5">
                      /{doc.slug}
                      {doc.currentVersion && (
                        <> · Version {doc.currentVersion.version_number}</>
                      )}
                    </p>
                    {doc.currentVersion?.change_note && (
                      <p className="text-xs font-body text-gray-400 mt-1 truncate">
                        Letzte Änderung: {doc.currentVersion.change_note}
                      </p>
                    )}
                  </div>

                  {/* Datum + PDF */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.currentVersion?.published_at && (
                      <p className="text-xs font-body text-gray-500">
                        {fmtDate(doc.currentVersion.published_at)}
                      </p>
                    )}
                    <a
                      href={`/api/admin/legal/pdf?slug=${doc.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#475569' }}
                      title="PDF herunterladen"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </a>
                  </div>

                  {/* Pfeil */}
                  <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}

        {/* Mietvertrag + Prüfung */}
        <div className="mt-8">
          <h2 className="font-heading font-semibold text-sm text-gray-400 uppercase tracking-wider mb-3">Mietvertrag</h2>
          <Link
            href="/admin/legal/vertragsparagraphen"
            className="flex items-center gap-4 p-5 rounded-2xl border transition-all hover:scale-[1.005]"
            style={{ background: '#111827', borderColor: '#1e293b', textDecoration: 'none' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
              style={{ background: 'rgba(6,182,212,0.15)' }}>
              📝
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-semibold text-sm text-white">Vertragsparagraphen</p>
              <p className="text-xs font-body text-gray-500 mt-0.5">
                19 Paragraphen des Mietvertrags — werden bei Vertragsabschluss in das PDF eingebettet
              </p>
            </div>
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        {/* KI-Prüfung Button */}
        <div className="mt-8">
          <h2 className="font-heading font-semibold text-sm text-gray-400 uppercase tracking-wider mb-3">KI-Prüfung</h2>
          <div
            className="p-5 rounded-2xl border"
            style={{ background: '#111827', borderColor: '#1e293b' }}
          >
            <p className="text-sm font-body text-gray-400 mb-4">
              Exportiert alle Rechtstexte, Vertragsparagraphen und Geschäftsdaten als Prompt.
              Kopiere den Text und füge ihn bei Claude ein, um Widersprüche und Probleme prüfen zu lassen.
            </p>
            {!promptText ? (
              <button
                onClick={handleExportPrompt}
                disabled={promptLoading}
                className="px-5 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors"
                style={{ background: '#06b6d4', color: '#0f172a', border: 'none', cursor: promptLoading ? 'not-allowed' : 'pointer', opacity: promptLoading ? 0.5 : 1 }}
              >
                {promptLoading ? 'Lade alle Texte...' : 'Prompt für KI-Prüfung generieren'}
              </button>
            ) : (
              <div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 rounded-lg text-sm font-heading font-semibold"
                    style={{ background: copied ? '#10b981' : '#06b6d4', color: '#0f172a', border: 'none', cursor: 'pointer' }}
                  >
                    {copied ? 'Kopiert!' : 'In Zwischenablage kopieren'}
                  </button>
                  <button
                    onClick={() => setPromptText('')}
                    className="px-4 py-2 rounded-lg text-sm font-heading font-semibold"
                    style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', cursor: 'pointer' }}
                  >
                    Schließen
                  </button>
                </div>
                <textarea
                  value={promptText}
                  readOnly
                  rows={15}
                  className="w-full rounded-xl text-xs font-body"
                  style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', padding: 12, resize: 'vertical', lineHeight: 1.5 }}
                />
                <p className="text-xs font-body text-gray-500 mt-2">
                  {promptText.length.toLocaleString('de-DE')} Zeichen — Kopiere diesen Text und füge ihn in einer neuen Claude-Sitzung ein.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
