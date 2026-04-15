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

export default function AdminLegalPage() {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);

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

                  {/* Datum */}
                  <div className="text-right flex-shrink-0">
                    {doc.currentVersion?.published_at && (
                      <p className="text-xs font-body text-gray-500">
                        {fmtDate(doc.currentVersion.published_at)}
                      </p>
                    )}
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
      </div>
    </div>
  );
}
