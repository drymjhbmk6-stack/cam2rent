'use client';

import { useEffect, useState } from 'react';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };
const sectionStyle: React.CSSProperties = { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20 };
const btnStyle: React.CSSProperties = { background: '#06b6d4', color: 'white', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 };
const btnDanger: React.CSSProperties = { background: '#ef4444', color: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 };

interface Category { id: string; name: string; slug: string; description: string; color: string; sort_order: number; }
interface AutoTopic { id: string; topic: string; keywords: string[]; category_id: string | null; tone: string; target_length: string; used: boolean; blog_categories?: { name: string; color: string } | null; }
interface SeriesPart { id: string; part_number: number; topic: string; used: boolean; post_id: string | null; }
interface Series { id: string; title: string; slug: string; description: string; category_id: string | null; tone: string; target_length: string; total_parts: number; generated_parts: number; status: string; blog_categories?: { name: string; color: string } | null; blog_series_parts?: SeriesPart[]; }

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[aeAE]/g, 'ae').replace(/[oeOE]/g, 'oe').replace(/[ueUE]/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function BlogThemenPage() {
  const [tab, setTab] = useState<'categories' | 'topics' | 'series'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<AutoTopic[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Kategorie
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catColor, setCatColor] = useState('#06b6d4');
  const [catDesc, setCatDesc] = useState('');

  // Thema
  const [topicText, setTopicText] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [topicCatId, setTopicCatId] = useState('');
  const [topicTone, setTopicTone] = useState('informativ');
  const [topicLength, setTopicLength] = useState('mittel');

  // Serie
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesDesc, setSeriesDesc] = useState('');
  const [seriesCatId, setSeriesCatId] = useState('');
  const [seriesTone, setSeriesTone] = useState('informativ');
  const [seriesLength, setSeriesLength] = useState('mittel');
  const [seriesParts, setSeriesParts] = useState<{ topic: string; keywords: string }[]>([
    { topic: '', keywords: '' },
    { topic: '', keywords: '' },
    { topic: '', keywords: '' },
  ]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [catRes, topRes, serRes] = await Promise.all([
      fetch('/api/admin/blog/categories'),
      fetch('/api/admin/blog/auto-topics'),
      fetch('/api/admin/blog/series'),
    ]);
    const catData = await catRes.json();
    const topData = await topRes.json();
    const serData = await serRes.json();
    setCategories(catData.categories ?? []);
    setTopics(topData.topics ?? []);
    setSeriesList(serData.series ?? []);
    setLoading(false);
  }

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 3000); }

  // Kategorie CRUD
  async function addCategory() {
    if (!catName.trim()) return;
    const res = await fetch('/api/admin/blog/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: catName.trim(), slug: catSlug.trim() || toSlug(catName), description: catDesc, color: catColor }) });
    if (res.ok) { setCatName(''); setCatSlug(''); setCatDesc(''); setCatColor('#06b6d4'); loadAll(); flash('Kategorie hinzugefuegt!'); } else { const d = await res.json(); flash(d.error || 'Fehler'); }
  }
  async function deleteCategory(id: string) { await fetch(`/api/admin/blog/categories/${id}`, { method: 'DELETE' }); loadAll(); }

  // Thema CRUD
  async function addTopic() {
    if (!topicText.trim()) return;
    const res = await fetch('/api/admin/blog/auto-topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topicText.trim(), keywords: topicKeywords.split(',').map((k) => k.trim()).filter(Boolean), category_id: topicCatId || null, tone: topicTone, target_length: topicLength }) });
    if (res.ok) { setTopicText(''); setTopicKeywords(''); loadAll(); flash('Thema hinzugefuegt!'); } else { const d = await res.json(); flash(d.error || 'Fehler'); }
  }
  async function deleteTopic(id: string) { await fetch(`/api/admin/blog/auto-topics?id=${id}`, { method: 'DELETE' }); loadAll(); }

  // Serie CRUD
  async function addSeries() {
    const validParts = seriesParts.filter((p) => p.topic.trim());
    if (!seriesTitle.trim() || validParts.length < 2) { flash('Titel und mindestens 2 Teile erforderlich.'); return; }
    const res = await fetch('/api/admin/blog/series', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: seriesTitle.trim(), slug: toSlug(seriesTitle), description: seriesDesc,
        category_id: seriesCatId || null, tone: seriesTone, target_length: seriesLength,
        parts: validParts.map((p) => ({ topic: p.topic, keywords: p.keywords.split(',').map((k) => k.trim()).filter(Boolean) })),
      }),
    });
    if (res.ok) { setSeriesTitle(''); setSeriesDesc(''); setSeriesParts([{ topic: '', keywords: '' }, { topic: '', keywords: '' }, { topic: '', keywords: '' }]); loadAll(); flash('Serie erstellt!'); }
    else { const d = await res.json(); flash(d.error || 'Fehler'); }
  }
  async function deleteSeries(id: string) { if (!confirm('Serie wirklich loeschen?')) return; await fetch(`/api/admin/blog/series/${id}`, { method: 'DELETE' }); loadAll(); }

  function updateSeriesPart(i: number, key: 'topic' | 'keywords', value: string) {
    setSeriesParts((prev) => prev.map((p, j) => j === i ? { ...p, [key]: value } : p));
  }
  function addSeriesPartRow() { setSeriesParts((prev) => [...prev, { topic: '', keywords: '' }]); }
  function removeSeriesPartRow(i: number) { setSeriesParts((prev) => prev.filter((_, j) => j !== i)); }

  if (loading) return <div className="p-4 sm:p-8"><p style={{ color: '#64748b' }}>Laden...</p></div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <h1 className="font-heading font-bold text-xl sm:text-2xl mb-1" style={{ color: 'white' }}>Themen</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>Kategorien, Einzelthemen und Artikelserien verwalten</p>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: '#22c55e' }}>{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {([
          { key: 'categories', label: `Kategorien (${categories.length})` },
          { key: 'topics', label: `Einzelthemen (${topics.length})` },
          { key: 'series', label: `Serien (${seriesList.length})` },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold whitespace-nowrap transition-colors"
            style={tab === t.key ? { background: '#06b6d4', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* === KATEGORIEN === */}
      {tab === 'categories' && (
        <>
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>Neue Kategorie</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle} className="block">Name</label>
                <input style={inputStyle} value={catName} onChange={(e) => { setCatName(e.target.value); setCatSlug(toSlug(e.target.value)); }} placeholder="z.B. Action-Cam Tipps" />
              </div>
              <div>
                <label style={labelStyle} className="block">Slug</label>
                <input style={inputStyle} value={catSlug} onChange={(e) => setCatSlug(e.target.value)} />
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
            <button onClick={addCategory} style={btnStyle} className="font-heading">Hinzufuegen</button>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: '#1e293b' }}>
                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: cat.color }} /><span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{cat.name}</span><span className="text-xs" style={{ color: '#475569' }}>/{cat.slug}</span></div>
                <button onClick={() => deleteCategory(cat.id)} style={btnDanger} className="font-heading">Loeschen</button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-center py-8" style={{ color: '#475569' }}>Noch keine Kategorien.</p>}
          </div>
        </>
      )}

      {/* === EINZELTHEMEN === */}
      {tab === 'topics' && (
        <>
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>Neues Einzelthema</h3>
            <div className="space-y-3">
              <div>
                <label style={labelStyle} className="block">Thema / Artikelidee</label>
                <input style={inputStyle} value={topicText} onChange={(e) => setTopicText(e.target.value)} placeholder="z.B. Die 5 besten Action-Cams fuer Unterwasser 2026" />
              </div>
              <div>
                <label style={labelStyle} className="block">Keywords (kommagetrennt)</label>
                <input style={inputStyle} value={topicKeywords} onChange={(e) => setTopicKeywords(e.target.value)} placeholder="z.B. Unterwasser, Action-Cam, GoPro" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle} className="block">Kategorie</label>
                  <select style={inputStyle} value={topicCatId} onChange={(e) => setTopicCatId(e.target.value)}>
                    <option value="">Keine</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Ton</label>
                  <select style={inputStyle} value={topicTone} onChange={(e) => setTopicTone(e.target.value)}>
                    <option value="informativ">Informativ</option><option value="locker">Locker</option><option value="professionell">Professionell</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Laenge</label>
                  <select style={inputStyle} value={topicLength} onChange={(e) => setTopicLength(e.target.value)}>
                    <option value="kurz">Kurz</option><option value="mittel">Mittel</option><option value="lang">Lang</option>
                  </select>
                </div>
              </div>
            </div>
            <button onClick={addTopic} style={btnStyle} className="font-heading mt-3">Hinzufuegen</button>
          </div>
          <div className="space-y-2">
            {topics.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: '#1e293b' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-sm truncate" style={{ color: '#e2e8f0' }}>{t.topic}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-heading shrink-0" style={t.used ? { background: '#22c55e20', color: '#22c55e' } : { background: '#06b6d420', color: '#06b6d4' }}>{t.used ? 'Verwendet' : 'Offen'}</span>
                  </div>
                </div>
                <button onClick={() => deleteTopic(t.id)} style={btnDanger} className="font-heading ml-3 shrink-0">Loeschen</button>
              </div>
            ))}
            {topics.length === 0 && <p className="text-sm text-center py-8" style={{ color: '#475569' }}>Noch keine Einzelthemen.</p>}
          </div>
        </>
      )}

      {/* === SERIEN === */}
      {tab === 'series' && (
        <>
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-1" style={{ color: '#e2e8f0' }}>Neue Artikelserie</h3>
            <p className="text-xs mb-4" style={{ color: '#475569' }}>Eine Serie besteht aus mehreren zusammenhaengenden Artikeln, die nacheinander generiert werden.</p>
            <div className="space-y-3">
              <div>
                <label style={labelStyle} className="block">Serientitel</label>
                <input style={inputStyle} value={seriesTitle} onChange={(e) => setSeriesTitle(e.target.value)} placeholder="z.B. Action-Cam Meisterklasse" />
              </div>
              <div>
                <label style={labelStyle} className="block">Beschreibung der Serie</label>
                <textarea style={{ ...inputStyle, minHeight: 60 }} value={seriesDesc} onChange={(e) => setSeriesDesc(e.target.value)} placeholder="Worum geht es in dieser Serie? Der KI hilft das als Kontext..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle} className="block">Kategorie</label>
                  <select style={inputStyle} value={seriesCatId} onChange={(e) => setSeriesCatId(e.target.value)}>
                    <option value="">Keine</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Ton</label>
                  <select style={inputStyle} value={seriesTone} onChange={(e) => setSeriesTone(e.target.value)}>
                    <option value="informativ">Informativ</option><option value="locker">Locker</option><option value="professionell">Professionell</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle} className="block">Laenge</label>
                  <select style={inputStyle} value={seriesLength} onChange={(e) => setSeriesLength(e.target.value)}>
                    <option value="kurz">Kurz</option><option value="mittel">Mittel</option><option value="lang">Lang</option>
                  </select>
                </div>
              </div>

              {/* Teile */}
              <div>
                <label style={labelStyle} className="block">Teile der Serie</label>
                <div className="space-y-2 mt-1">
                  {seriesParts.map((part, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="shrink-0 w-7 h-9 flex items-center justify-center rounded text-xs font-heading font-bold" style={{ background: '#0f172a', color: '#06b6d4' }}>{i + 1}</span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input style={inputStyle} value={part.topic} onChange={(e) => updateSeriesPart(i, 'topic', e.target.value)} placeholder={`Teil ${i + 1}: Thema`} />
                        <input style={inputStyle} value={part.keywords} onChange={(e) => updateSeriesPart(i, 'keywords', e.target.value)} placeholder="Keywords (optional)" />
                      </div>
                      {seriesParts.length > 2 && (
                        <button onClick={() => removeSeriesPartRow(i)} className="shrink-0 w-9 h-9 flex items-center justify-center rounded" style={{ color: '#ef4444', background: '#ef444410' }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addSeriesPartRow} className="mt-2 text-xs font-heading font-semibold px-3 py-1.5 rounded" style={{ color: '#06b6d4', background: '#06b6d410' }}>
                  + Weiteren Teil hinzufuegen
                </button>
              </div>
            </div>
            <button onClick={addSeries} style={btnStyle} className="font-heading mt-4">Serie erstellen</button>
          </div>

          {/* Serien-Liste */}
          <div className="space-y-3">
            {seriesList.map((s) => {
              const progress = s.total_parts > 0 ? (s.generated_parts / s.total_parts) * 100 : 0;
              const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                active: { bg: '#06b6d420', color: '#06b6d4', label: 'Aktiv' },
                paused: { bg: '#f59e0b20', color: '#f59e0b', label: 'Pausiert' },
                completed: { bg: '#22c55e20', color: '#22c55e', label: 'Abgeschlossen' },
              };
              const sc = statusColors[s.status] ?? statusColors.active;

              return (
                <div key={s.id} className="rounded-xl p-4" style={{ background: '#1e293b' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{s.title}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-heading" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      {s.description && <p className="text-xs mb-2" style={{ color: '#475569' }}>{s.description}</p>}
                      {/* Fortschritt */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: '#0f172a' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#06b6d4' }} />
                        </div>
                        <span className="text-xs font-heading shrink-0" style={{ color: '#94a3b8' }}>{s.generated_parts}/{s.total_parts}</span>
                      </div>
                      {/* Teile */}
                      <div className="flex flex-wrap gap-1">
                        {s.blog_series_parts?.sort((a, b) => a.part_number - b.part_number).map((p) => (
                          <span key={p.id} className="text-[11px] px-2 py-0.5 rounded" style={p.used ? { background: '#22c55e15', color: '#22c55e' } : { background: '#0f172a', color: '#64748b' }}>
                            Teil {p.part_number}: {p.topic.slice(0, 30)}{p.topic.length > 30 ? '...' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => deleteSeries(s.id)} style={btnDanger} className="font-heading shrink-0">Loeschen</button>
                  </div>
                </div>
              );
            })}
            {seriesList.length === 0 && <p className="text-sm text-center py-8" style={{ color: '#475569' }}>Noch keine Serien erstellt.</p>}
          </div>
        </>
      )}
    </div>
  );
}
