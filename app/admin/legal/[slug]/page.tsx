'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import MarkdownEditor from '@/components/MarkdownEditor';
import MarkdownContent from '@/components/MarkdownContent';
import { useToast } from '@/components/admin/ui/FeedbackProvider';
import { fmtDateTime } from '@/lib/format-utils';

interface Version {
  id: string;
  version_number: number;
  content: string;
  content_format: string;
  change_note: string | null;
  published_at: string;
  published_by: string | null;
  is_current: boolean;
}

interface LegalDoc {
  id: string;
  slug: string;
  title: string;
  current_version_id: string | null;
  updated_at: string;
}

// Lokaler fmtDate entfernt — nutzt jetzt zentralen fmtDateTime aus lib/format-utils
// (vorher: fehlende Europe/Berlin-TZ -> falscher Tag zwischen 22-02 Uhr auf UTC-Server)
const fmtDate = fmtDateTime;

export default function AdminLegalEditPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { error: toastError } = useToast();

  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [currentVersion, setCurrentVersion] = useState<Version | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor State
  const [content, setContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Versionshistorie
  const [showHistory, setShowHistory] = useState(false);
  const [viewVersion, setViewVersion] = useState<Version | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  // Tab: editor | preview
  const [tab, setTab] = useState<'editor' | 'preview'>('editor');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/legal?slug=${slug}&versions=1`);
      const data = await res.json();
      if (data.document) {
        setDoc(data.document);
        setCurrentVersion(data.currentVersion);
        setVersions(data.versions ?? []);
        setContent(data.currentVersion?.content ?? '');
        setHasChanges(false);
      }
    } catch {}
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Änderungserkennung
  useEffect(() => {
    if (currentVersion) {
      setHasChanges(content !== currentVersion.content);
    }
  }, [content, currentVersion]);

  async function handlePublish() {
    if (!doc || !content.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/admin/legal/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          content,
          content_format: 'markdown',
          change_note: changeNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setPublished(true);
      setChangeNote('');
      setTimeout(() => setPublished(false), 3000);
      await fetchData();
    } catch {
      toastError('Fehler beim Veröffentlichen.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleRestore(version: Version) {
    if (!doc) return;
    setRestoring(version.id);
    try {
      const res = await fetch('/api/admin/legal/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          content: version.content,
          content_format: version.content_format,
          change_note: `Wiederhergestellt aus Version ${version.version_number}`,
        }),
      });
      if (!res.ok) throw new Error();
      setViewVersion(null);
      await fetchData();
    } catch {
      toastError('Fehler beim Wiederherstellen.');
    } finally {
      setRestoring(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <AdminBackLink href="/admin/legal" label="Zurück zu Rechtliches" />
          <p className="text-gray-400 mt-8">Dokument nicht gefunden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <AdminBackLink href="/admin/legal" label="Zurück zu Rechtliches" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading font-bold text-xl" style={{ color: 'var(--admin-heading)' }}>{doc.title}</h1>
            <p className="text-xs font-body text-gray-500 mt-1">
              /{doc.slug}
              {currentVersion && (
                <> · Version {currentVersion.version_number} · {fmtDate(currentVersion.published_at)}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/legal/pdf?slug=${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-heading font-semibold transition-colors"
              style={{ background: 'var(--admin-surface-2)', color: 'var(--admin-muted)' }}
              title="Aktuelle Version als PDF"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </a>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-heading font-semibold transition-colors"
            style={{
              background: showHistory ? 'var(--admin-accent-soft)' : 'var(--admin-surface-2)',
              color: showHistory ? 'var(--admin-accent)' : 'var(--admin-muted)',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Versionshistorie ({versions.length})
          </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Editor-Bereich */}
          <div className="flex-1 min-w-0">
            {/* Tab-Leiste */}
            <div className="flex items-center gap-1 mb-3">
              {(['editor', 'preview'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-colors"
                  style={{
                    background: tab === t ? 'var(--admin-accent-soft)' : 'transparent',
                    color: tab === t ? 'var(--admin-accent)' : 'var(--admin-text-dim)',
                  }}
                >
                  {t === 'editor' ? 'Bearbeiten' : 'Vorschau'}
                </button>
              ))}
              {hasChanges && (
                <span className="ml-auto text-xs font-body px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                  Ungespeicherte Änderungen
                </span>
              )}
            </div>

            {/* Editor */}
            {tab === 'editor' ? (
              <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                <div className="p-4">
                  <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder="Markdown-Inhalt eingeben..."
                    rows={24}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border p-6 overflow-auto" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)', maxHeight: '70vh' }}>
                <div className="prose prose-sm max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-a:text-cyan-400">
                  <MarkdownContent>{content || '*Kein Inhalt*'}</MarkdownContent>
                </div>
              </div>
            )}

            {/* Veröffentlichen */}
            <div className="mt-4 rounded-2xl border p-4" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-heading font-semibold text-gray-400 mb-1.5">
                    Änderungsnotiz (optional)
                  </label>
                  <input
                    type="text"
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="z.B. Lieferzeiten aktualisiert"
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    style={{ background: 'var(--admin-surface-2)', border: '1px solid var(--admin-input-border)', color: 'var(--admin-text)' }}
                  />
                </div>
                <button
                  onClick={handlePublish}
                  disabled={publishing || !hasChanges}
                  className="px-6 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: published ? '#22c55e' : 'var(--admin-accent)',
                    color: '#ffffff',
                  }}
                >
                  {publishing ? 'Veröffentlichen...' : published ? 'Veröffentlicht!' : 'Veröffentlichen'}
                </button>
              </div>
            </div>
          </div>

          {/* Versionshistorie (Sidebar) */}
          {showHistory && (
            <div className="w-80 flex-shrink-0">
              <div className="rounded-2xl border overflow-hidden sticky top-8" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)', maxHeight: '80vh' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <p className="text-xs font-heading font-semibold text-gray-400 uppercase tracking-wider">
                    Versionshistorie
                  </p>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 48px)' }}>
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="px-4 py-3 transition-colors"
                      style={{
                        borderBottom: '1px solid var(--admin-border)',
                        background: v.is_current ? 'rgba(6,182,212,0.05)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-heading font-semibold" style={{ color: 'var(--admin-text)' }}>
                          Version {v.version_number}
                          {v.is_current && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)' }}>
                              aktuell
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] font-body text-gray-500 mb-1">
                        {fmtDate(v.published_at)}
                      </p>
                      {v.change_note && (
                        <p className="text-xs font-body text-gray-400 mb-2 line-clamp-2">
                          {v.change_note}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewVersion(v)}
                          className="text-[11px] font-heading font-semibold transition-colors"
                          style={{ color: 'var(--admin-accent)' }}
                        >
                          Anzeigen
                        </button>
                        <a
                          href={`/api/admin/legal/pdf?slug=${slug}&version=${v.version_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-heading font-semibold transition-colors"
                          style={{ color: 'var(--admin-muted)' }}
                        >
                          PDF
                        </a>
                        {!v.is_current && (
                          <button
                            onClick={() => handleRestore(v)}
                            disabled={restoring === v.id}
                            className="text-[11px] font-heading font-semibold transition-colors disabled:opacity-40"
                            style={{ color: '#f59e0b' }}
                          >
                            {restoring === v.id ? 'Wird wiederhergestellt...' : 'Wiederherstellen'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Version-Anzeige-Modal */}
        {viewVersion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--admin-border)' }}>
                <div>
                  <h3 className="font-heading font-bold text-sm" style={{ color: 'var(--admin-heading)' }}>
                    Version {viewVersion.version_number}
                    {viewVersion.is_current && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)' }}>
                        aktuell
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-body text-gray-500 mt-0.5">
                    {fmtDate(viewVersion.published_at)}
                    {viewVersion.change_note && <> · {viewVersion.change_note}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!viewVersion.is_current && (
                    <button
                      onClick={() => handleRestore(viewVersion)}
                      disabled={restoring === viewVersion.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors disabled:opacity-40"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                    >
                      {restoring === viewVersion.id ? 'Wird wiederhergestellt...' : 'Wiederherstellen'}
                    </button>
                  )}
                  <button
                    onClick={() => setViewVersion(null)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--admin-text-dim)' }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Diff-Hinweis wenn nicht aktuelle Version */}
                {!viewVersion.is_current && currentVersion && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-xs font-body" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                    Dies ist eine ältere Version. Klicke „Wiederherstellen&rdquo;, um sie als neue aktuelle Version zu veröffentlichen.
                  </div>
                )}
                <div className="prose prose-sm max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-a:text-cyan-400">
                  <MarkdownContent>{viewVersion.content}</MarkdownContent>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
