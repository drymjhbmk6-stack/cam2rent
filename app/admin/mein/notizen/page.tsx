'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface Attachment {
  id: string;
  path: string;
  filename: string;
  mime: string;
  size: number;
}

interface NotePage {
  id: string;
  content: string;
  attachments: Attachment[];
}

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  pages: NotePage[];
  shared_with: string[];
  is_owner: boolean;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
}

function newPage(content = '', attachments: Attachment[] = []): NotePage {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    attachments,
  };
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

function newChecklistItem(text = ''): ChecklistItem {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    done: false,
  };
}

const COLOR_PRESETS: { value: string; label: string; bg: string }[] = [
  { value: 'default', label: 'Standard', bg: '#1e293b' },
  { value: 'amber', label: 'Gelb', bg: '#78350f' },
  { value: 'cyan', label: 'Cyan', bg: '#155e75' },
  { value: 'pink', label: 'Pink', bg: '#831843' },
  { value: 'emerald', label: 'Grün', bg: '#064e3b' },
  { value: 'violet', label: 'Lila', bg: '#4c1d95' },
];

function isHexColor(color: string | null | undefined): color is string {
  return !!color && (/^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color));
}

function colorBg(color: string | null): string {
  if (!color || color === 'default') return '#1e293b';
  const preset = COLOR_PRESETS.find((c) => c.value === color);
  if (preset) return preset.bg;
  if (isHexColor(color)) return color;
  return '#1e293b';
}

function attachmentUrl(path: string): string {
  return `/api/admin/mein/notizen/attachment?path=${encodeURIComponent(path)}`;
}
function isImage(mime: string): boolean { return mime.startsWith('image/'); }
function isVideo(mime: string): boolean { return mime.startsWith('video/'); }
function fileIcon(mime: string): string {
  if (mime === 'application/pdf') return '📄';
  if (isVideo(mime)) return '🎬';
  return '📎';
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'gerade';
  if (diff < 3600_000) return `vor ${Math.round(diff / 60_000)} Min`;
  if (diff < 86400_000) return `vor ${Math.round(diff / 3600_000)} Std`;
  if (diff < 7 * 86400_000) return `vor ${Math.round(diff / 86400_000)} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE');
}

export default function MeineNotizenPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mein/notizen', { cache: 'no-store' });
      const json = await res.json();
      if (json.legacy) setWarn('Du bist mit dem Notfall-Login angemeldet. Bitte mit Mitarbeiter-Konto einloggen, um persönliche Notizen zu nutzen.');
      else if (json.migration_pending) setWarn('Die Migration supabase-employee-personal.sql ist noch nicht eingespielt — Notizen können noch nicht gespeichert werden.');
      else setWarn(null);
      setNotes((json.notes ?? []).map((n: Note) => ({
        ...n,
        checklist: Array.isArray(n.checklist) ? n.checklist : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
        pages: Array.isArray(n.pages) ? n.pages : [],
        shared_with: Array.isArray(n.shared_with) ? n.shared_with : [],
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/admin/mein/employees', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setEmployees(j.employees ?? []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.pages.some((p) => p.content.toLowerCase().includes(q)) ||
      n.checklist.some((it) => it.text.toLowerCase().includes(q)),
    );
  }, [notes, search]);

  async function handleToggleChecklistItem(note: Note, itemId: string) {
    const nextChecklist = note.checklist.map((it) =>
      it.id === itemId ? { ...it, done: !it.done } : it,
    );
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, checklist: nextChecklist } : n)));
    const res = await fetch(`/api/admin/mein/notizen/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: nextChecklist }),
    });
    if (!res.ok) void load();
  }

  async function handleTogglePin(note: Note) {
    const res = await fetch(`/api/admin/mein/notizen/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    if (res.ok) void load();
  }

  async function handleDelete(note: Note) {
    if (!confirm(`Notiz "${note.title || '(ohne Titel)'}" wirklich löschen?`)) return;
    const res = await fetch(`/api/admin/mein/notizen/${note.id}`, { method: 'DELETE' });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>📝 Meine Notizen</h1>
          <button
            onClick={() => setCreating(true)}
            style={{ background: '#06b6d4', color: '#0a0a0a', border: 0, padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
            disabled={!!warn && !warn.startsWith('Du bist')}
          >
            + Neue Notiz
          </button>
        </div>

        {warn && (
          <div style={{ background: '#78350f', color: '#fde68a', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            ⚠ {warn}
          </div>
        )}

        <input
          type="search"
          placeholder="In Notizen suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', marginBottom: 20, fontSize: 14 }}
        />

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Lädt…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <p style={{ fontSize: 48, margin: 0 }}>📓</p>
            <p style={{ marginTop: 12 }}>Noch keine Notizen. Leg dir eine an!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filtered.map((note) => {
              const imgAtts = note.attachments.filter((a) => isImage(a.mime));
              return (
              <div
                key={note.id}
                style={{
                  background: colorBg(note.color),
                  border: '1px solid #334155',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                  position: 'relative',
                  minHeight: 140,
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onClick={() => setEditing(note)}
              >
                {note.pinned && (
                  <span style={{ position: 'absolute', top: 8, right: 8, background: '#facc15', color: '#0a0a0a', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>📌 PIN</span>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: (note.owner_name || note.shared_with.length > 0 || note.pages.length > 1) ? 6 : 0 }}>
                  {note.pages.length > 1 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fcd34d' }}>📖 {note.pages.length} Seiten</span>
                  )}
                  {(note.owner_name || note.shared_with.length > 0) && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#67e8f9' }}>
                      {note.is_owner ? `👥 Geteilt (${note.shared_with.length})` : `👤 Geteilt von ${note.owner_name}`}
                    </span>
                  )}
                </div>
                {note.title && (
                  <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#f8fafc', paddingRight: note.pinned ? 56 : 0 }}>
                    {note.title}
                  </h3>
                )}
                {(note.content || (note.checklist.length === 0 && imgAtts.length === 0)) && (
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', whiteSpace: 'pre-wrap', flex: note.checklist.length === 0 ? 1 : undefined, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical' }}>
                    {note.content || <em style={{ color: '#64748b' }}>(leer)</em>}
                  </p>
                )}
                {imgAtts.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    {imgAtts.slice(0, 3).map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={attachmentUrl(a.path)}
                        alt={a.filename}
                        onClick={() => setLightbox(attachmentUrl(a.path))}
                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #475569' }}
                      />
                    ))}
                    {note.attachments.length > imgAtts.slice(0, 3).length && (
                      <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>📎 {note.attachments.length}</span>
                    )}
                  </div>
                )}
                {imgAtts.length === 0 && note.attachments.length > 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>📎 {note.attachments.length} Anhang/Anhänge</div>
                )}
                {note.checklist.length > 0 && (
                  <div style={{ flex: 1, marginTop: note.content ? 8 : 0 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                      ✓ {note.checklist.filter((it) => it.done).length}/{note.checklist.length} erledigt
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                      {note.checklist.slice(0, 8).map((it) => (
                        <label key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, cursor: 'pointer', color: it.done ? '#64748b' : '#cbd5e1' }}>
                          <input
                            type="checkbox"
                            checked={it.done}
                            onChange={() => handleToggleChecklistItem(note, it.id)}
                            style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span style={{ textDecoration: it.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{it.text}</span>
                        </label>
                      ))}
                      {note.checklist.length > 8 && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>+ {note.checklist.length - 8} weitere…</span>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                  <span>{fmtRelative(note.updated_at)}</span>
                  <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleTogglePin(note)}
                      title={note.pinned ? 'Pin entfernen' : 'Anpinnen'}
                      style={{ background: 'transparent', border: 0, color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
                    >
                      {note.pinned ? '📌' : '📍'}
                    </button>
                    {note.is_owner && (
                      <button
                        onClick={() => handleDelete(note)}
                        title="Löschen"
                        style={{ background: 'transparent', border: 0, color: '#f87171', cursor: 'pointer', fontSize: 14 }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <NoteEditModal
          note={editing}
          employees={employees}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void load(); }}
          onOpenLightbox={setLightbox}
        />
      )}

      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function NoteEditModal({ note, employees, onClose, onSaved, onOpenLightbox }: {
  note: Note | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
  onOpenLightbox: (url: string) => void;
}) {
  const isOwner = !note || note.is_owner;
  const [title, setTitle] = useState(note?.title ?? '');
  // Inhalt wird immer als Seiten-Liste geführt. Klassische Einzel-Notizen
  // (pages leer) werden als 1 Seite aus content + attachments synthetisiert.
  const [pages, setPages] = useState<NotePage[]>(() => {
    if (note?.pages && note.pages.length > 0) {
      return note.pages.map((p) => ({ id: p.id, content: p.content, attachments: p.attachments ?? [] }));
    }
    return [newPage(note?.content ?? '', note?.attachments ?? [])];
  });
  const [activeIdx, setActiveIdx] = useState(0);
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [color, setColor] = useState(note?.color ?? 'default');
  const [customHex, setCustomHex] = useState(isHexColor(note?.color) ? (note!.color as string) : '');
  const customActive = isHexColor(color);

  function applyHex(v: string) {
    let h = v.trim();
    if (h && !h.startsWith('#')) h = `#${h}`;
    setCustomHex(h);
    if (isHexColor(h)) setColor(h.toLowerCase());
  }
  const [checklist, setChecklist] = useState<ChecklistItem[]>(note?.checklist ?? []);
  const [sharedWith, setSharedWith] = useState<string[]>(note?.shared_with ?? []);
  const [newItemText, setNewItemText] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activePage = pages[activeIdx] ?? pages[0];
  const isBook = pages.length > 1;

  function updateActivePage(patch: Partial<NotePage>) {
    setPages((prev) => prev.map((p, i) => (i === activeIdx ? { ...p, ...patch } : p)));
  }

  function addPage() {
    setPages((prev) => [...prev, newPage()]);
    setActiveIdx(pages.length);
  }

  function removePage() {
    if (pages.length <= 1) return;
    const label = `Seite ${activeIdx + 1}`;
    if (!confirm(`${label} mit Text und Bildern wirklich löschen?`)) return;
    setPages((prev) => prev.filter((_, i) => i !== activeIdx));
    setActiveIdx((i) => Math.max(0, Math.min(i, pages.length - 2)));
  }

  function addItem() {
    const t = newItemText.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, newChecklistItem(t)]);
    setNewItemText('');
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    const uploaded: Attachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/admin/mein/notizen/attachment', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) { setErr(json.error ?? 'Upload fehlgeschlagen'); continue; }
        uploaded.push(json.attachment as Attachment);
      }
      if (uploaded.length > 0) {
        setPages((prev) => prev.map((p, i) => (i === activeIdx ? { ...p, attachments: [...p.attachments, ...uploaded] } : p)));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeAttachment(id: string) {
    setPages((prev) => prev.map((p, i) => (i === activeIdx ? { ...p, attachments: p.attachments.filter((a) => a.id !== id) } : p)));
  }

  function toggleShare(empId: string) {
    setSharedWith((prev) => prev.includes(empId) ? prev.filter((x) => x !== empId) : [...prev, empId]);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const cleanChecklist = checklist.filter((it) => it.text.trim());
      const cleanPages = pages.map((p) => ({ id: p.id, content: p.content, attachments: p.attachments }));
      const page1 = cleanPages[0] ?? { content: '', attachments: [] };
      const url = note ? `/api/admin/mein/notizen/${note.id}` : '/api/admin/mein/notizen';
      const method = note ? 'PATCH' : 'POST';
      // Seite 1 wird immer auf content/attachments gespiegelt (Karten-Vorschau).
      // Ab 2 Seiten lebt der volle Inhalt zusätzlich in pages (Buch-Modus).
      const payload: Record<string, unknown> = {
        title,
        content: page1.content,
        attachments: page1.attachments,
        pages: cleanPages.length > 1 ? cleanPages : [],
        pinned,
        color,
        checklist: cleanChecklist,
      };
      if (isOwner) payload.shared_with = sharedWith;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? 'Fehler'); return; }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#f8fafc' }}>
          {note ? 'Notiz bearbeiten' : 'Neue Notiz'}
        </h2>
        {note && !isOwner && (
          <div style={{ background: '#155e75', color: '#cffafe', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '8px 0 14px' }}>
            👤 Geteilt von {note.owner_name}. Du kannst Inhalt + Anhänge bearbeiten, aber nicht löschen oder die Freigabe ändern.
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4, marginTop: 12 }}>Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (optional)"
          maxLength={200}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 16, marginBottom: 12 }}
        />

        {/* Seiten-Navigator (Buch-Modus) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            {isBook ? `📖 Seite ${activeIdx + 1} / ${pages.length}` : 'Inhalt'}
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isBook && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  title="Vorherige Seite"
                  style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6, padding: '4px 10px', cursor: activeIdx === 0 ? 'default' : 'pointer', opacity: activeIdx === 0 ? 0.4 : 1, fontSize: 14 }}
                >‹</button>
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => Math.min(pages.length - 1, i + 1))}
                  disabled={activeIdx === pages.length - 1}
                  title="Nächste Seite"
                  style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6, padding: '4px 10px', cursor: activeIdx === pages.length - 1 ? 'default' : 'pointer', opacity: activeIdx === pages.length - 1 ? 0.4 : 1, fontSize: 14 }}
                >›</button>
                <button
                  type="button"
                  onClick={removePage}
                  title="Diese Seite löschen"
                  style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
                >🗑 Seite</button>
              </>
            )}
            <button
              type="button"
              onClick={addPage}
              title="Neue Seite hinzufügen"
              style={{ background: '#0e7490', color: '#ecfeff', border: '1px solid #06b6d4', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >+ Seite</button>
          </div>
        </div>
        {/* Seiten-Reiter zum Direktsprung */}
        {isBook && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                title={`Zu Seite ${i + 1}`}
                style={{
                  width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: i === activeIdx ? '#06b6d4' : '#1e293b',
                  color: i === activeIdx ? '#0a0a0a' : '#cbd5e1',
                  border: `1px solid ${i === activeIdx ? '#06b6d4' : '#475569'}`,
                }}
              >{i + 1}</button>
            ))}
          </div>
        )}
        <textarea
          value={activePage?.content ?? ''}
          onChange={(e) => updateActivePage({ content: e.target.value })}
          rows={8}
          placeholder={isBook ? `Text für Seite ${activeIdx + 1}…` : 'Was möchtest du dir merken?'}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 16, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }}
        />

        {/* Anhänge der aktiven Seite */}
        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
          📎 Bilder &amp; Dateien {isBook ? `auf Seite ${activeIdx + 1}` : ''} (Bilder, PDF, Videos)
        </label>
        {(activePage?.attachments.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {activePage.attachments.map((a) => (
              <div key={a.id} style={{ position: 'relative', width: 86, border: '1px solid #334155', borderRadius: 8, padding: 6, background: '#1e293b' }}>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  title="Entfernen"
                  style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', border: 0, borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}
                >
                  ✕
                </button>
                {isImage(a.mime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachmentUrl(a.path)}
                    alt={a.filename}
                    onClick={() => onOpenLightbox(attachmentUrl(a.path))}
                    style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                  />
                ) : (
                  <a href={attachmentUrl(a.path)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, fontSize: 28, textDecoration: 'none' }}>
                    {fileIcon(a.mime)}
                  </a>
                )}
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.filename}>
                  {a.filename}
                </div>
                <div style={{ fontSize: 9, color: '#64748b' }}>{fmtBytes(a.size)}</div>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,video/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ background: '#334155', color: '#e2e8f0', border: 0, padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginBottom: 14, opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? 'Lädt hoch…' : '+ Datei anhängen'}
        </button>

        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
          ✓ To-do-Liste {checklist.length > 0 && `(${checklist.filter((it) => it.done).length}/${checklist.length})`}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {checklist.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => setChecklist((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                type="text"
                value={it.text}
                onChange={(e) => setChecklist((prev) => prev.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
                maxLength={500}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: it.done ? '#64748b' : '#e2e8f0', fontSize: 15, textDecoration: it.done ? 'line-through' : 'none' }}
              />
              <button
                type="button"
                onClick={() => setChecklist((prev) => prev.filter((x) => x.id !== it.id))}
                title="Punkt entfernen"
                style={{ background: 'transparent', border: 0, color: '#f87171', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
            placeholder="Neuen Punkt hinzufügen…"
            maxLength={500}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 16 }}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newItemText.trim()}
            style={{ background: '#334155', color: '#e2e8f0', border: 0, padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', opacity: newItemText.trim() ? 1 : 0.5 }}
          >
            + Hinzufügen
          </button>
        </div>

        {/* Teilen — nur Besitzer */}
        {isOwner && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
              👥 Teilen mit Kollegen {sharedWith.length > 0 && `(${sharedWith.length})`}
            </label>
            {employees.length === 0 ? (
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Keine weiteren Mitarbeiter vorhanden.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {employees.map((emp) => {
                  const active = sharedWith.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggleShare(emp.id)}
                      style={{
                        background: active ? '#0e7490' : '#1e293b',
                        color: active ? '#ecfeff' : '#cbd5e1',
                        border: `1px solid ${active ? '#06b6d4' : '#475569'}`,
                        borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: active ? 700 : 500,
                      }}
                    >
                      {active ? '✓ ' : ''}{emp.name}
                    </button>
                  );
                })}
              </div>
            )}
            {sharedWith.length > 0 && (
              <p style={{ fontSize: 11, color: '#67e8f9', margin: '6px 0 0' }}>Geteilte Kollegen dürfen die Notiz mitbearbeiten.</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 14 }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            📌 Anpinnen
          </label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                title={c.label}
                style={{
                  width: 24, height: 24, borderRadius: 12, background: c.bg,
                  border: color === c.value ? '2px solid #06b6d4' : '1px solid #475569',
                  cursor: 'pointer',
                }}
              />
            ))}
            <span style={{ width: 1, height: 20, background: '#475569', margin: '0 2px' }} />
            {/* Eigene Farbe (Hex) */}
            <label
              title="Eigene Farbe wählen"
              style={{
                position: 'relative', width: 24, height: 24, borderRadius: 12, cursor: 'pointer',
                background: customActive ? color : 'conic-gradient(#f87171,#fbbf24,#34d399,#22d3ee,#a78bfa,#f87171)',
                border: customActive ? '2px solid #06b6d4' : '1px solid #475569',
                display: 'inline-block', flexShrink: 0,
              }}
            >
              <input
                type="color"
                value={customActive ? color : (isHexColor(customHex) ? customHex : '#06b6d4')}
                onChange={(e) => applyHex(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 0 }}
              />
            </label>
            <input
              type="text"
              value={customHex}
              onChange={(e) => applyHex(e.target.value)}
              placeholder="#RRGGBB"
              maxLength={7}
              spellCheck={false}
              style={{
                width: 96, padding: '5px 8px', borderRadius: 6, fontSize: 13, fontFamily: 'monospace',
                border: `1px solid ${customActive ? '#06b6d4' : '#475569'}`,
                background: '#1e293b', color: '#e2e8f0',
              }}
            />
          </div>
        </div>

        {err && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>⚠ {err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
          >
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={saving || (!title.trim() && checklist.filter((it) => it.text.trim()).length === 0 && pages.every((p) => !p.content.trim() && p.attachments.length === 0))}
            style={{ background: '#06b6d4', color: '#0a0a0a', border: 0, padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
