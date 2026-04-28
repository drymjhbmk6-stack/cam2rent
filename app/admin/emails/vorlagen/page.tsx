'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string;
  recipient: 'customer' | 'admin';
}

interface OverrideEntry {
  subject?: string;
  introHtml?: string;
}

type OverrideMap = Record<string, OverrideEntry>;

export default function EmailVorlagenPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [tplRes, ovRes] = await Promise.all([
        fetch('/api/admin/email-templates'),
        fetch('/api/admin/email-templates/overrides'),
      ]);
      const tpl = await tplRes.json();
      const ov = await ovRes.json();
      if (tpl.error) throw new Error(tpl.error);
      if (ov.error) throw new Error(ov.error);
      setTemplates(tpl.templates ?? []);
      setOverrides(ov.overrides ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorlagen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const customizedCount = Object.keys(overrides).length;
  const editingTemplate = editId ? templates.find((t) => t.id === editId) ?? null : null;
  const editingOverride = editId ? overrides[editId] ?? null : null;

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück zum Dashboard" href="/admin" />

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="font-heading font-bold text-xl text-white">E-Mail-Vorlagen</h1>
          <span className="text-xs font-body px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
            {templates.length}
          </span>
          {customizedCount > 0 && (
            <span className="text-xs font-body px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              {customizedCount} angepasst
            </span>
          )}
        </div>
        <p className="text-sm font-body text-gray-400 mb-6">
          Übersicht aller automatisch versendeten E-Mails — mit Vorschau und optionaler Anpassung von Betreff und Einleitungstext.
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
                hasOverride={Boolean(overrides[t.id])}
                onPreview={() => setPreviewId(t.id)}
                onEdit={() => setEditId(t.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <p className="text-xs font-body text-gray-400 leading-relaxed">
            <strong style={{ color: '#e2e8f0' }}>Hinweis:</strong> Betreff und ein Einleitungstext lassen sich pro Vorlage anpassen.
            Die Anpassungen werden in <code className="text-cyan-400">admin_settings.email_template_overrides</code> gespeichert
            und greifen sofort — bei echten Versendungen, manuellem Versand aus Buchungsdetails und in dieser Vorschau.
            Tieferreichende Änderungen (komplettes Layout, Tabellen, Anhänge) werden weiterhin im Code gepflegt
            (<code className="text-cyan-400">lib/email.ts</code>).
          </p>
        </div>
      </div>

      {previewId && (
        <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />
      )}

      {editId && editingTemplate && (
        <EditModal
          template={editingTemplate}
          override={editingOverride}
          onClose={() => setEditId(null)}
          onSaved={async () => {
            setEditId(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  hasOverride,
  onPreview,
  onEdit,
}: {
  template: Template;
  hasOverride: boolean;
  onPreview: () => void;
  onEdit: () => void;
}) {
  const isCustomer = template.recipient === 'customer';
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: '#111827', borderColor: hasOverride ? 'rgba(245,158,11,0.45)' : '#1e293b' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-heading font-semibold text-sm text-white leading-tight">
          {template.name}
        </h2>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasOverride && (
            <span
              className="text-[10px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}
              title="Diese Vorlage hat eine Admin-Anpassung."
            >
              ✏ angepasst
            </span>
          )}
          <span
            className="text-[10px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: isCustomer ? 'rgba(6,182,212,0.15)' : 'rgba(245,158,11,0.15)',
              color: isCustomer ? '#06b6d4' : '#f59e0b',
            }}
          >
            {isCustomer ? 'Kunde' : 'Admin'}
          </span>
        </div>
      </div>
      <p className="text-xs font-body text-gray-400 leading-relaxed mb-4">
        {template.description}
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Bearbeiten
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

function EditModal({
  template,
  override,
  onClose,
  onSaved,
}: {
  template: Template;
  override: OverrideEntry | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [subject, setSubject] = useState(override?.subject ?? '');
  const [introHtml, setIntroHtml] = useState(override?.introHtml ?? '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [previewBust, setPreviewBust] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasExisting = Boolean(override?.subject || override?.introHtml);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email-templates/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          subject: subject.trim(),
          introHtml: introHtml.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!hasExisting) {
      setSubject('');
      setIntroHtml('');
      return;
    }
    if (!confirm('Anpassungen verwerfen und Standard wiederherstellen?')) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/email-templates/overrides?id=${encodeURIComponent(template.id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Zurücksetzen fehlgeschlagen.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zurücksetzen fehlgeschlagen.');
    } finally {
      setResetting(false);
    }
  }

  function refreshPreview() {
    setPreviewBust((n) => n + 1);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#111827', border: '1px solid #1e293b' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
          <div>
            <h3 className="font-heading font-bold text-sm text-white">{template.name} · bearbeiten</h3>
            <code className="text-[11px] text-gray-500">{template.id}</code>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-xl border p-3 text-xs" style={{ background: '#7f1d1d', borderColor: '#ef4444', color: '#fee2e2' }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-heading font-semibold text-gray-300 mb-1.5">
              Betreff <span className="text-gray-500 font-normal">(leer = Standard)</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={250}
              placeholder="z. B. Willkommen bei cam2rent — deine Buchung"
              className="w-full rounded-lg px-3 py-2 text-base text-white"
              style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Maximal 250 Zeichen. Wenn leer, wird der Standard-Betreff aus dem Code verwendet.
            </p>
          </div>

          <div>
            <label className="block text-xs font-heading font-semibold text-gray-300 mb-1.5">
              Einleitungstext <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={introHtml}
              onChange={(e) => setIntroHtml(e.target.value)}
              rows={6}
              placeholder={'Wird direkt nach der Hauptüberschrift eingefügt.\nErlaubte Tags: <b>, <i>, <p>, <br>, <a href="...">, <ul>, <li>'}
              className="w-full rounded-lg px-3 py-2 text-base text-white font-mono"
              style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Erlaubt einen begrenzten HTML-Subset (<code>b, i, p, br, a, ul, ol, li, h2, h3, span</code>).
              <code>&lt;script&gt;</code>, <code>&lt;iframe&gt;</code>, Event-Handler und <code>javascript:</code>-Links werden entfernt.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowLivePreview((v) => !v);
                refreshPreview();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}
            >
              {showLivePreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
            </button>
            {showLivePreview && (
              <button
                type="button"
                onClick={refreshPreview}
                className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold"
                style={{ color: '#94a3b8', border: '1px solid #1e293b' }}
              >
                Vorschau aktualisieren
              </button>
            )}
            <span className="text-[11px] text-gray-500">
              Anpassungen müssen gespeichert sein, damit die Vorschau sie widerspiegelt.
            </span>
          </div>

          {showLivePreview && (
            <iframe
              key={previewBust}
              src={`/api/admin/email-templates/preview?id=${encodeURIComponent(template.id)}&_=${previewBust}`}
              className="w-full bg-white rounded-xl"
              style={{ border: '1px solid #1e293b', height: '60vh' }}
              title="Live-Vorschau"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: '1px solid #1e293b' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || (!hasExisting && !subject && !introHtml)}
            className="px-3 py-2 rounded-lg text-xs font-heading font-semibold disabled:opacity-50"
            style={{ color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            {resetting ? 'Setze zurück…' : hasExisting ? 'Auf Standard zurücksetzen' : 'Felder leeren'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-heading font-semibold"
              style={{ color: '#94a3b8', border: '1px solid #1e293b' }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-heading font-semibold disabled:opacity-50"
              style={{ background: '#06b6d4', color: '#0a0f1e' }}
            >
              {saving ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
