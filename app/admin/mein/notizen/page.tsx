'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const COLOR_PRESETS: { value: string; label: string; bg: string }[] = [
  { value: 'default', label: 'Standard', bg: '#1e293b' },
  { value: 'amber', label: 'Gelb', bg: '#78350f' },
  { value: 'cyan', label: 'Cyan', bg: '#155e75' },
  { value: 'pink', label: 'Pink', bg: '#831843' },
  { value: 'emerald', label: 'Grün', bg: '#064e3b' },
  { value: 'violet', label: 'Lila', bg: '#4c1d95' },
];

function colorBg(color: string | null): string {
  if (!color || color === 'default') return '#1e293b';
  return COLOR_PRESETS.find((c) => c.value === color)?.bg ?? '#1e293b';
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
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mein/notizen', { cache: 'no-store' });
      const json = await res.json();
      if (json.legacy) setWarn('Du bist mit dem Notfall-Login angemeldet. Bitte mit Mitarbeiter-Konto einloggen, um persönliche Notizen zu nutzen.');
      else if (json.migration_pending) setWarn('Die Migration supabase-employee-personal.sql ist noch nicht eingespielt — Notizen können noch nicht gespeichert werden.');
      else setWarn(null);
      setNotes(json.notes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, search]);

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
            {filtered.map((note) => (
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
                {note.title && (
                  <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#f8fafc', paddingRight: note.pinned ? 56 : 0 }}>
                    {note.title}
                  </h3>
                )}
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', whiteSpace: 'pre-wrap', flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical' }}>
                  {note.content || <em style={{ color: '#64748b' }}>(leer)</em>}
                </p>
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
                    <button
                      onClick={() => handleDelete(note)}
                      title="Löschen"
                      style={{ background: 'transparent', border: 0, color: '#f87171', cursor: 'pointer', fontSize: 14 }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <NoteEditModal
          note={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void load(); }}
        />
      )}
    </div>
  );
}

function NoteEditModal({ note, onClose, onSaved }: {
  note: Note | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [color, setColor] = useState(note?.color ?? 'default');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const url = note ? `/api/admin/mein/notizen/${note.id}` : '/api/admin/mein/notizen';
      const method = note ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, pinned, color }),
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
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 20, width: '100%', maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#f8fafc' }}>
          {note ? 'Notiz bearbeiten' : 'Neue Notiz'}
        </h2>

        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (optional)"
          maxLength={200}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 16, marginBottom: 12 }}
        />

        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Inhalt</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder="Was möchtest du dir merken?"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 16, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }}
        />

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 14 }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            📌 Anpinnen
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
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
            disabled={saving || (!title.trim() && !content.trim())}
            style={{ background: '#06b6d4', color: '#0a0a0a', border: 0, padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
