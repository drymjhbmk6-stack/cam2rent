'use client';

import { useEffect, useState } from 'react';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };
const sectionStyle: React.CSSProperties = { background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24 };
const btnStyle: React.CSSProperties = { background: '#06b6d4', color: 'white', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 };
const btnDanger: React.CSSProperties = { background: '#ef4444', color: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 };

interface Category {
  id: string; name: string; slug: string; description: string; color: string; sort_order: number;
}

interface AutoTopic {
  id: string; topic: string; keywords: string[]; category_id: string | null; tone: string;
  target_length: string; used: boolean; used_at: string | null;
  blog_categories?: { id: string; name: string; slug: string; color: string } | null;
}

function toSlug(text: string): string {
  return text.toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function BlogThemenPage() {
  const [tab, setTab] = useState<'categories' | 'topics'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<AutoTopic[]>([]);
  const [loading, setLoading] = useState(true);

  // Kategorie-Form
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catColor, setCatColor] = useState('#06b6d4');
  const [catDesc, setCatDesc] = useState('');

  // Thema-Form
  const [topicText, setTopicText] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [topicCatId, setTopicCatId] = useState('');
  const [topicTone, setTopicTone] = useState('informativ');
  const [topicLength, setTopicLength] = useState('mittel');

  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [catRes, topRes] = await Promise.all([
      fetch('/api/admin/blog/categories'),
      fetch('/api/admin/blog/auto-topics'),
    ]);
    const catData = await catRes.json();
    const topData = await topRes.json();
    setCategories(catData.categories ?? []);
    setTopics(topData.topics ?? []);
    setLoading(false);
  }

  async function addCategory() {
    if (!catName.trim()) return;
    const res = await fetch('/api/admin/blog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: catName.trim(),
        slug: catSlug.trim() || toSlug(catName),
        description: catDesc,
        color: catColor,
      }),
    });
    if (res.ok) {
      setCatName(''); setCatSlug(''); setCatDesc(''); setCatColor('#06b6d4');
      loadAll();
      flash('Kategorie hinzugefuegt!');
    } else {
      const d = await res.json();
      flash(d.error || 'Fehler');
    }
  }

  async function deleteCategory(id: string) {
    await fetch(`/api/admin/blog/categories/${id}`, { method: 'DELETE' });
    loadAll();
  }

  async function addTopic() {
    if (!topicText.trim()) return;
    const res = await fetch('/api/admin/blog/auto-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topicText.trim(),
        keywords: topicKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        category_id: topicCatId || null,
        tone: topicTone,
        target_length: topicLength,
      }),
    });
    if (res.ok) {
      setTopicText(''); setTopicKeywords('');
      loadAll();
      flash('Thema hinzugefuegt!');
    } else {
      const d = await res.json();
      flash(d.error || 'Fehler');
    }
  }

  async function deleteTopic(id: string) {
    await fetch(`/api/admin/blog/auto-topics?id=${id}`, { method: 'DELETE' });
    loadAll();
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>Themen</h1>
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>Themen</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>Kategorien und Auto-Themenpool verwalten</p>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: '#22c55e' }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['categories', 'topics'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors"
            style={tab === t ? { background: '#06b6d4', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}
          >
            {t === 'categories' ? `Kategorien (${categories.length})` : `Auto-Themen (${topics.length})`}
          </button>
        ))}
      </div>

      {/* Kategorien */}
      {tab === 'categories' && (
        <>
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>Neue Kategorie</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle} className="block">Name</label>
                <input style={inputStyle} value={catName} onChange={(e) => { setCatName(e.target.value); setCatSlug(toSlug(e.target.value)); }} placeholder="z.B. Action-Cam Tipps" />
              </div>
              <div>
                <label style={labelStyle} className="block">Slug</label>
                <input style={inputStyle} value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="action-cam-tipps" />
              </div>
              <div>
                <label style={labelStyle} className="block">Beschreibung</label>
                <input style={inputStyle} value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label style={labelStyle} className="block">Farbe</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="h-9 w-12 rounded border-0 cursor-pointer" />
                  <input style={inputStyle} value={catColor} onChange={(e) => setCatColor(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>
            <button onClick={addCategory} style={btnStyle} className="font-heading">Kategorie hinzufuegen</button>
          </div>

          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: '#1e293b' }}>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                  <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{cat.name}</span>
                  <span className="text-xs" style={{ color: '#475569' }}>/{cat.slug}</span>
                </div>
                <button onClick={() => deleteCategory(cat.id)} style={btnDanger} className="font-heading">Loeschen</button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: '#475569' }}>Noch keine Kategorien angelegt.</p>
            )}
          </div>
        </>
      )}

      {/* Auto-Themen */}
      {tab === 'topics' && (
        <>
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>Neues Thema fuer Auto-Generierung</h3>
            <div className="space-y-3">
              <div>
                <label style={labelStyle} className="block">Thema / Artikelidee</label>
                <input style={inputStyle} value={topicText} onChange={(e) => setTopicText(e.target.value)} placeholder="z.B. Die 5 besten Action-Cams fuer Unterwasseraufnahmen 2025" />
              </div>
              <div>
                <label style={labelStyle} className="block">Keywords (kommagetrennt)</label>
                <input style={inputStyle} value={topicKeywords} onChange={(e) => setTopicKeywords(e.target.value)} placeholder="z.B. Unterwasser, Action-Cam, GoPro, Tauchen" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle} className="block">Kategorie</label>
                  <select style={inputStyle} value={topicCatId} onChange={(e) => setTopicCatId(e.target.value)}>
                    <option value="">Keine</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Ton</label>
                  <select style={inputStyle} value={topicTone} onChange={(e) => setTopicTone(e.target.value)}>
                    <option value="informativ">Informativ</option>
                    <option value="locker">Locker</option>
                    <option value="professionell">Professionell</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Laenge</label>
                  <select style={inputStyle} value={topicLength} onChange={(e) => setTopicLength(e.target.value)}>
                    <option value="kurz">Kurz</option>
                    <option value="mittel">Mittel</option>
                    <option value="lang">Lang</option>
                  </select>
                </div>
              </div>
            </div>
            <button onClick={addTopic} style={btnStyle} className="font-heading mt-3">Thema hinzufuegen</button>
          </div>

          <div className="space-y-2">
            {topics.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: '#1e293b' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-sm truncate" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                    {t.used && (
                      <span className="px-2 py-0.5 rounded text-xs font-heading" style={{ background: '#22c55e20', color: '#22c55e' }}>Verwendet</span>
                    )}
                    {!t.used && (
                      <span className="px-2 py-0.5 rounded text-xs font-heading" style={{ background: '#06b6d420', color: '#06b6d4' }}>Offen</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {t.blog_categories && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: t.blog_categories.color + '20', color: t.blog_categories.color }}>{t.blog_categories.name}</span>
                    )}
                    {t.keywords?.map((k, i) => (
                      <span key={i} className="text-xs" style={{ color: '#475569' }}>#{k}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => deleteTopic(t.id)} style={btnDanger} className="font-heading ml-3">Loeschen</button>
              </div>
            ))}
            {topics.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: '#475569' }}>Noch keine Auto-Themen angelegt.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
