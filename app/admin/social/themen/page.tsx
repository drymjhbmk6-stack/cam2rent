'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Topic {
  id: string;
  topic: string;
  angle?: string | null;
  keywords: string[];
  category?: string | null;
  platforms: string[];
  with_image: boolean;
  used: boolean;
  used_at?: string | null;
  created_at: string;
}

interface Series {
  id: string;
  title: string;
  description: string;
  platforms: string[];
  total_parts: number;
  generated_parts: number;
  status: string;
  parts: SeriesPart[];
}

interface SeriesPart {
  id: string;
  part_number: number;
  topic: string;
  angle?: string | null;
  keywords: string[];
  used: boolean;
}

type Tab = 'topics' | 'series';

export default function ThemenPage() {
  const [tab, setTab] = useState<Tab>('topics');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mt-4 mb-4">Themen & Serien</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-800">
        <TabButton active={tab === 'topics'} onClick={() => setTab('topics')}>Einzelthemen</TabButton>
        <TabButton active={tab === 'series'} onClick={() => setTab('series')}>Serien</TabButton>
      </div>

      {tab === 'topics' && <TopicsTab />}
      {tab === 'series' && <SeriesTab />}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 font-medium text-sm transition-colors"
      style={active ? { color: '#06b6d4', borderBottom: '2px solid #06b6d4', marginBottom: '-2px' } : { color: '#94a3b8' }}
    >
      {children}
    </button>
  );
}

function TopicsTab() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    topic: '',
    angle: '',
    keywords: '',
    category: 'produkt',
    platforms: ['facebook', 'instagram'] as string[],
    with_image: true,
  });

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/social/topics');
    const data = await res.json();
    setTopics(data.topics ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    const res = await fetch('/api/admin/social/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        keywords: form.keywords.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      setCreating(false);
      setForm({ ...form, topic: '', angle: '', keywords: '' });
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Thema löschen?')) return;
    await fetch(`/api/admin/social/topics/${id}`, { method: 'DELETE' });
    load();
  }

  const open = topics.filter((t) => !t.used);
  const used = topics.filter((t) => t.used);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">Sammle Post-Ideen im Pool. Du kannst sie dann in den Redaktionsplan übernehmen.</p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500"
        >
          + Neues Thema
        </button>
      </div>

      {creating && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-4">
          <h3 className="font-semibold text-white mb-3">Neues Thema</h3>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Thema / Titel</label>
          <input type="text" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
            placeholder="z.B. Die 5 besten Kameras fuer Ski-Urlaub"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />

          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Kernaussage</label>
          <textarea value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })}
            placeholder="Was genau soll der Post vermitteln? (1-2 Sätze)"
            rows={2}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />

          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Kategorie</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            <option value="produkt">Produkt-Spotlight</option>
            <option value="tipp">Nutzer-Tipp</option>
            <option value="inspiration">Inspiration / Anwendung</option>
            <option value="aktion">Aktion / Angebot</option>
            <option value="bts">Behind the Scenes</option>
            <option value="community">Community / UGC</option>
            <option value="ankuendigung">Ankündigung</option>
          </select>

          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Keywords (Leerzeichen/Komma getrennt)</label>
          <input type="text" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder="ski snowboard gopro wintersport"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />

          <div className="flex gap-3 mb-4 text-sm">
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" checked={form.platforms.includes('facebook')}
                onChange={() => setForm({ ...form, platforms: form.platforms.includes('facebook') ? form.platforms.filter((p) => p !== 'facebook') : [...form.platforms, 'facebook'] })} />
              Facebook
            </label>
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" checked={form.platforms.includes('instagram')}
                onChange={() => setForm({ ...form, platforms: form.platforms.includes('instagram') ? form.platforms.filter((p) => p !== 'instagram') : [...form.platforms, 'instagram'] })} />
              Instagram
            </label>
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer ml-4">
              <input type="checkbox" checked={form.with_image} onChange={(e) => setForm({ ...form, with_image: e.target.checked })} />
              Mit Bild (DALL-E)
            </label>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={!form.topic}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50">Speichern</button>
            <button type="button" onClick={() => setCreating(false)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-semibold text-sm hover:bg-slate-600">Abbrechen</button>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-400">Lade…</p>}

      {!loading && open.length === 0 && used.length === 0 && (
        <p className="text-slate-400">Noch keine Themen. Leg welche an oder lass KI welche generieren (unter KI-Plan).</p>
      )}

      {!loading && open.length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold text-white mb-2">Offene Themen ({open.length})</h3>
          <div className="space-y-2">
            {open.map((t) => <TopicRow key={t.id} topic={t} onDelete={handleDelete} />)}
          </div>
        </section>
      )}

      {!loading && used.length > 0 && (
        <section>
          <h3 className="font-semibold text-slate-500 mb-2 text-sm">Bereits verwendet ({used.length})</h3>
          <div className="space-y-2 opacity-60">
            {used.map((t) => <TopicRow key={t.id} topic={t} onDelete={handleDelete} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function TopicRow({ topic, onDelete }: { topic: Topic; onDelete: (id: string) => void }) {
  return (
    <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-slate-200 font-medium">{topic.topic}</p>
            {topic.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">{topic.category}</span>}
            {topic.used && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300">verwendet</span>}
          </div>
          {topic.angle && <p className="text-xs text-slate-400 mb-1">{topic.angle}</p>}
          {topic.keywords.length > 0 && (
            <p className="text-xs text-slate-500">{topic.keywords.map((k) => (k.startsWith('#') ? k : `#${k}`)).join(' ')}</p>
          )}
        </div>
        <button type="button" onClick={() => onDelete(topic.id)} className="text-xs text-red-400 hover:text-red-300">Löschen</button>
      </div>
    </div>
  );
}

function SeriesTab() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    platforms: ['facebook', 'instagram'] as string[],
    parts: [
      { topic: '', angle: '', keywords: '' },
      { topic: '', angle: '', keywords: '' },
      { topic: '', angle: '', keywords: '' },
    ],
  });

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/social/series');
    const data = await res.json();
    setSeries(data.series ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    const validParts = form.parts.filter((p) => p.topic.trim()).map((p) => ({
      topic: p.topic,
      angle: p.angle,
      keywords: p.keywords.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean),
    }));
    const res = await fetch('/api/admin/social/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        platforms: form.platforms,
        parts: validParts,
      }),
    });
    if (res.ok) {
      setCreating(false);
      setForm({ title: '', description: '', platforms: ['facebook', 'instagram'], parts: [{ topic: '', angle: '', keywords: '' }, { topic: '', angle: '', keywords: '' }, { topic: '', angle: '', keywords: '' }] });
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Serie mit allen Teilen löschen?')) return;
    await fetch(`/api/admin/social/series/${id}`, { method: 'DELETE' });
    load();
  }

  function addPart() {
    setForm({ ...form, parts: [...form.parts, { topic: '', angle: '', keywords: '' }] });
  }
  function updatePart(i: number, field: 'topic' | 'angle' | 'keywords', value: string) {
    const parts = [...form.parts];
    parts[i] = { ...parts[i], [field]: value };
    setForm({ ...form, parts });
  }
  function removePart(i: number) {
    if (form.parts.length <= 1) return;
    setForm({ ...form, parts: form.parts.filter((_, j) => j !== i) });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">Mehrteilige Post-Serien (z.B. &quot;3-teilige Meisterklasse&quot;).</p>
        <button type="button" onClick={() => setCreating(true)} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500">+ Neue Serie</button>
      </div>

      {creating && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-4">
          <h3 className="font-semibold text-white mb-3">Neue Serie</h3>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Serientitel</label>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="z.B. Action-Cam Meisterklasse"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />

          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Beschreibung</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm" />

          <h4 className="font-semibold text-white mt-4 mb-2 text-sm">Teile</h4>
          {form.parts.map((p, i) => (
            <div key={i} className="rounded-lg bg-slate-950/50 border border-slate-800 p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase">Teil {i + 1}</span>
                {form.parts.length > 1 && <button type="button" onClick={() => removePart(i)} className="text-xs text-red-400 hover:text-red-300">Entfernen</button>}
              </div>
              <input type="text" value={p.topic} onChange={(e) => updatePart(i, 'topic', e.target.value)} placeholder="Thema des Teils"
                className="w-full mb-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
              <input type="text" value={p.angle} onChange={(e) => updatePart(i, 'angle', e.target.value)} placeholder="Kernaussage"
                className="w-full mb-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
              <input type="text" value={p.keywords} onChange={(e) => updatePart(i, 'keywords', e.target.value)} placeholder="Keywords (space-separated)"
                className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-sm" />
            </div>
          ))}

          <button type="button" onClick={addPart} className="text-sm text-cyan-400 hover:text-cyan-300 mb-4">+ Weiteren Teil</button>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={handleCreate} disabled={!form.title || form.parts.filter((p) => p.topic.trim()).length === 0}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50">Speichern</button>
            <button type="button" onClick={() => setCreating(false)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-semibold text-sm hover:bg-slate-600">Abbrechen</button>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-400">Lade…</p>}

      {!loading && series.length === 0 && !creating && <p className="text-slate-400">Noch keine Serien.</p>}

      <div className="space-y-3">
        {series.map((s) => {
          const progress = s.total_parts > 0 ? Math.round((s.generated_parts / s.total_parts) * 100) : 0;
          return (
            <div key={s.id} className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{s.title}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{s.generated_parts} / {s.total_parts}</span>
                    {s.status !== 'active' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{s.status}</span>}
                  </div>
                  {s.description && <p className="text-xs text-slate-400 mt-1">{s.description}</p>}
                </div>
                <button type="button" onClick={() => handleDelete(s.id)} className="text-xs text-red-400 hover:text-red-300">Löschen</button>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
                <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <ul className="space-y-1">
                {(s.parts ?? []).sort((a, b) => a.part_number - b.part_number).map((p) => (
                  <li key={p.id} className="text-xs flex items-center gap-2">
                    <span className={p.used ? 'text-emerald-400' : 'text-slate-500'}>{p.used ? '✓' : '○'}</span>
                    <span className="text-slate-300">Teil {p.part_number}: {p.topic}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
