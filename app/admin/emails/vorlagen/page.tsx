'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string;
  recipient: 'customer' | 'admin';
}

export default function EmailVorlagenPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/email-templates')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setTemplates(d.templates ?? []);
        }
      })
      .catch(() => setError('Vorlagen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück zum Dashboard" href="/admin" />

        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-heading font-bold text-xl text-white">E-Mail-Vorlagen</h1>
          <span className="text-xs font-body px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
            {templates.length}
          </span>
        </div>
        <p className="text-sm font-body text-gray-400 mb-6">
          Übersicht aller automatisch versendeten E-Mails — mit Vorschau (Dummy-Daten, kein Versand).
        </p>

        {error && (
          <div className="rounded-xl border p-4 mb-4 text-sm" style={{ background: '#7f1d1d', borderColor: '#ef4444', color: '#fee2e2' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onPreview={() => setPreviewId(t.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <p className="text-xs font-body text-gray-400 leading-relaxed">
            <strong style={{ color: '#e2e8f0' }}>Hinweis:</strong> Diese Übersicht ist aktuell nur zum Lesen.
            Die Inhalte werden im Code gepflegt (<code className="text-cyan-400">lib/email.ts</code>).
            Eine Bearbeitungsfunktion kann bei Bedarf als nächster Schritt ergänzt werden.
          </p>
        </div>
      </div>

      {/* Preview-Modal */}
      {previewId && (
        <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}

function TemplateCard({ template, onPreview }: { template: Template; onPreview: () => void }) {
  const isCustomer = template.recipient === 'customer';
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: '#111827', borderColor: '#1e293b' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-heading font-semibold text-sm text-white leading-tight">
          {template.name}
        </h2>
        <span
          className="text-[10px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: isCustomer ? 'rgba(6,182,212,0.15)' : 'rgba(245,158,11,0.15)',
            color: isCustomer ? '#06b6d4' : '#f59e0b',
          }}
        >
          {isCustomer ? 'Kunde' : 'Admin'}
        </span>
      </div>
      <p className="text-xs font-body text-gray-400 leading-relaxed mb-4">
        {template.description}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors"
          style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Vorschau
        </button>
        <a
          href={`/api/admin/email-templates/preview?id=${template.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors"
          style={{ color: '#94a3b8', border: '1px solid #1e293b' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Neuer Tab
        </a>
      </div>
      <code className="block mt-3 text-[10px] text-gray-600 font-mono">{template.id}</code>
    </div>
  );
}

function PreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#111827', border: '1px solid #1e293b' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
          <div>
            <h3 className="font-heading font-bold text-sm text-white">E-Mail-Vorschau</h3>
            <code className="text-[11px] text-gray-500">{id}</code>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#94a3b8' }}
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <iframe
          src={`/api/admin/email-templates/preview?id=${encodeURIComponent(id)}`}
          className="flex-1 w-full bg-white"
          title="E-Mail-Vorschau"
        />
      </div>
    </div>
  );
}
