'use client';

import { useState, useEffect } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Paragraph {
  title: string;
  text: string;
  /** Kategorie/Rechtsquelle des Paragraphen. Optional — Altbestand ohne dieses
   *  Feld fällt auf die index-basierte PARAGRAPH_SOURCES-Map zurück (die
   *  Default-19 sind dort korrekt zugeordnet). Neue/umsortierte Paragraphen
   *  tragen ihre Kategorie selbst → Badges wandern nicht. */
  category?: string;
}

const CATEGORIES = ['AGB', 'Haftung', 'Widerruf', 'Datenschutz'] as const;
const CATEGORY_COLORS: Record<string, string> = {
  AGB: '#06b6d4',
  Haftung: '#f59e0b',
  Widerruf: '#8b5cf6',
  Datenschutz: '#22c55e',
};

// Mapping: Welche Paragraphen gehören zu welchem Rechtsdokument
const PARAGRAPH_SOURCES: Record<number, { source: string; color: string }> = {
  0:  { source: 'AGB', color: '#06b6d4' },
  1:  { source: 'AGB', color: '#06b6d4' },
  2:  { source: 'AGB', color: '#06b6d4' },
  3:  { source: 'AGB', color: '#06b6d4' },
  4:  { source: 'AGB', color: '#06b6d4' },
  5:  { source: 'AGB', color: '#06b6d4' },
  6:  { source: 'Haftung', color: '#f59e0b' },
  7:  { source: 'Haftung', color: '#f59e0b' },
  8:  { source: 'Haftung', color: '#f59e0b' },
  9:  { source: 'AGB', color: '#06b6d4' },
  10: { source: 'AGB', color: '#06b6d4' },
  11: { source: 'AGB', color: '#06b6d4' },
  12: { source: 'Widerruf', color: '#8b5cf6' },
  13: { source: 'Haftung', color: '#f59e0b' },
  14: { source: 'AGB', color: '#06b6d4' },
  15: { source: 'Datenschutz', color: '#22c55e' },
  16: { source: 'AGB', color: '#06b6d4' },
  17: { source: 'AGB', color: '#06b6d4' },
  18: { source: 'AGB', color: '#06b6d4' },
};

export default function VertragsparagraphenContent() {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState<string>('AGB');
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [original, setOriginal] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/legal/contract-paragraphs');
        if (res.ok) {
          const data = await res.json();
          setParagraphs(data.paragraphs);
          setOriginal(JSON.stringify(data.paragraphs));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(paragraphs) !== original);
  }, [paragraphs, original]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Kategorie eines Paragraphen: eigenes Feld hat Vorrang, sonst Index-Map
  // (Default-19), sonst AGB. Farbe aus der Kategorie-Map.
  function resolveCategory(p: Paragraph, index: number): { source: string; color: string } {
    const source = p.category || PARAGRAPH_SOURCES[index]?.source || 'AGB';
    return { source, color: CATEGORY_COLORS[source] || '#06b6d4' };
  }

  function openEdit(index: number) {
    setEditIndex(index);
    setEditTitle(paragraphs[index].title);
    setEditText(paragraphs[index].text);
    setEditCategory(resolveCategory(paragraphs[index], index).source);
  }

  function saveEdit() {
    if (editIndex === null) return;
    const updated = [...paragraphs];
    updated[editIndex] = { title: editTitle, text: editText, category: editCategory };
    setParagraphs(updated);
    setEditIndex(null);
  }

  function addParagraph() {
    const nextNr = paragraphs.length + 1;
    const updated = [...paragraphs, { title: `§ ${nextNr} `, text: '', category: 'AGB' }];
    setParagraphs(updated);
    // Neuen Paragraphen direkt zum Bearbeiten öffnen
    const idx = updated.length - 1;
    setEditIndex(idx);
    setEditTitle(updated[idx].title);
    setEditText('');
    setEditCategory('AGB');
    // Ans Ende scrollen (nach Render)
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  }

  function deleteParagraph(index: number) {
    const t = paragraphs[index]?.title || `Paragraph ${index + 1}`;
    if (!confirm(`„${t}" wirklich löschen? Bereits unterschriebene Verträge bleiben unverändert.`)) return;
    setParagraphs(paragraphs.filter((_, i) => i !== index));
    setEditIndex(null);
  }

  function moveParagraph(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= paragraphs.length) return;
    const updated = [...paragraphs];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setParagraphs(updated);
    setEditIndex(target); // dem verschobenen Eintrag folgen
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/legal/contract-paragraphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs }),
      });
      if (res.ok) {
        setOriginal(JSON.stringify(paragraphs));
        showToast('Vertragsparagraphen gespeichert', 'ok');
      } else {
        showToast('Fehler beim Speichern', 'err');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Alle Paragraphen auf die Standard-Texte zurücksetzen? Deine Änderungen gehen verloren.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/legal/contract-paragraphs', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setParagraphs(data.paragraphs);
        setOriginal(JSON.stringify(data.paragraphs));
        showToast('Auf Standard zurückgesetzt', 'ok');
      }
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
    fontFamily: 'inherit',
  };

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück zu Rechtliche Dokumente" href="/admin/legal" />

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading font-bold text-xl text-white">Vertragsparagraphen</h1>
            <p className="text-sm font-body text-gray-400 mt-1">
              Diese {paragraphs.length} Paragraphen werden in jeden Mietvertrag (PDF) eingebettet.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={addParagraph} disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.35)' }}>
              + Paragraph hinzufügen
            </button>
            <button onClick={handleReset} disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }}>
              Standard wiederherstellen
            </button>
            <button onClick={handleSave} disabled={saving || !hasChanges}
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving || !hasChanges ? 'not-allowed' : 'pointer', background: hasChanges ? '#06b6d4' : '#1e293b', color: hasChanges ? '#0f172a' : '#64748b', border: 'none', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Legende */}
        <div className="flex gap-4 mb-6 flex-wrap">
          {[
            { label: 'AGB', color: '#06b6d4' },
            { label: 'Haftung', color: '#f59e0b' },
            { label: 'Widerruf', color: '#8b5cf6' },
            { label: 'Datenschutz', color: '#22c55e' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {paragraphs.map((p, i) => {
              const source = resolveCategory(p, i);
              return (
                <div key={i}
                  className="rounded-xl border transition-all"
                  style={{ background: '#111827', borderColor: editIndex === i ? '#06b6d4' : '#1e293b' }}
                >
                  <button
                    onClick={() => editIndex === i ? setEditIndex(null) : openEdit(i)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    {/* Source-Badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: `${source.color}15`, color: source.color, whiteSpace: 'nowrap',
                    }}>
                      {source.source}
                    </span>

                    {/* Titel */}
                    <span className="flex-1 font-heading font-semibold text-sm text-white truncate">
                      {p.title}
                    </span>

                    {/* Pfeil */}
                    <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#475569', transform: editIndex === i ? 'rotate(90deg)' : 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Editor (aufklappbar) */}
                  {editIndex === i && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="flex gap-3 flex-wrap items-end">
                        <div style={{ flex: '1 1 220px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Titel (inkl. § Nummer)</label>
                          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inputStyle} />
                        </div>
                        <div style={{ flex: '0 0 160px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Kategorie</label>
                          <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Text</label>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={10}
                          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <button onClick={saveEdit}
                          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none' }}>
                          Übernehmen
                        </button>
                        <button onClick={() => setEditIndex(null)}
                          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }}>
                          Abbrechen
                        </button>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => moveParagraph(i, -1)} disabled={i === 0} title="Nach oben"
                          style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: i === 0 ? 'not-allowed' : 'pointer', background: 'transparent', color: i === 0 ? '#475569' : '#94a3b8', border: '1px solid #1e293b' }}>
                          ▲
                        </button>
                        <button onClick={() => moveParagraph(i, 1)} disabled={i === paragraphs.length - 1} title="Nach unten"
                          style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: i === paragraphs.length - 1 ? 'not-allowed' : 'pointer', background: 'transparent', color: i === paragraphs.length - 1 ? '#475569' : '#94a3b8', border: '1px solid #1e293b' }}>
                          ▼
                        </button>
                        <button onClick={() => deleteParagraph(i)} title="Löschen"
                          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info-Box */}
        <div style={{ marginTop: 24, padding: 16, background: 'rgba(6,182,212,0.06)', borderRadius: 12, border: '1px solid rgba(6,182,212,0.15)' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Änderungen an den Vertragsparagraphen wirken sich nur auf <strong style={{ color: '#e2e8f0' }}>neue Verträge</strong> aus.
            Bereits unterschriebene Verträge bleiben unverändert (der SHA-256 Hash sichert die Integrität).
            <br /><br />
            <strong style={{ color: '#e2e8f0' }}>Nummerierung:</strong> Die §-Nummer steht im Titel und wird nicht
            automatisch vergeben. Neue Paragraphen am besten <strong style={{ color: '#e2e8f0' }}>am Ende</strong> mit
            der nächsten fortlaufenden Nummer anlegen. Umsortieren nummeriert <strong style={{ color: '#e2e8f0' }}>nicht</strong> automatisch
            um — und im Vertragstext gibt es feste Verweise (z. B. „§ 7“), also Nummern der bestehenden Paragraphen nicht verschieben.
            <br /><br />
            Wenn du Rechtstexte (AGB, Haftung, Widerruf, Datenschutz) unter &quot;Rechtliche Dokumente&quot; änderst,
            erhältst du eine Erinnerung die zugehörigen Vertragsparagraphen zu prüfen.
          </p>
        </div>
      </div>
    </div>
  );
}
