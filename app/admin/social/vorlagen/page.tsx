'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  platforms: string[];
  media_type: string;
  caption_prompt: string;
  image_prompt?: string | null;
  default_hashtags: string[];
  is_active: boolean;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manuell',
  blog_publish: 'Blog veröffentlicht',
  product_added: 'Neue Kamera',
  set_added: 'Neues Set',
  voucher_created: 'Neuer Gutschein',
  seasonal: 'Saisonal',
  scheduled: 'Redaktionsplan',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/social/templates');
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(t: Partial<Template> & { id?: string }) {
    const url = t.id ? `/api/admin/social/templates/${t.id}` : '/api/admin/social/templates';
    const method = t.id ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) });
    if (res.ok) {
      setEditing(null);
      setCreating(false);
      load();
    } else {
      alert('Speichern fehlgeschlagen');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    const res = await fetch(`/api/admin/social/templates/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  async function toggleActive(t: Template) {
    await fetch(`/api/admin/social/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <div className="flex items-center justify-between mb-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vorlagen</h1>
          <p className="text-sm text-slate-400">KI-Prompts für automatisch generierte Posts.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch('/api/admin/social/templates/seed', { method: 'POST' });
              const data = await res.json();
              alert(data.message || `${data.imported} neue Standard-Vorlagen importiert (${data.skipped} bereits vorhanden).`);
              load();
            }}
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700 border border-slate-700"
            title="Laedt offizielle Standard-Vorlagen (Community, Ankuendigung, Testimonial, etc.)"
          >
            ↓ Standard-Vorlagen importieren
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500"
          >
            + Neue Vorlage
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-400">Lade…</p>}

      {!loading && templates.length === 0 && !creating && (
        <p className="text-slate-400">Noch keine Vorlagen.</p>
      )}

      {creating && (
        <TemplateEditor
          initial={{
            name: '',
            description: '',
            trigger_type: 'manual',
            platforms: ['facebook', 'instagram'],
            media_type: 'image',
            caption_prompt: '',
            image_prompt: '',
            default_hashtags: [],
            is_active: true,
          }}
          onSave={handleSave}
          onCancel={() => setCreating(false)}
        />
      )}

      {!creating && !editing && (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl bg-slate-900/50 border border-slate-800"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white">{t.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                      {TRIGGER_LABELS[t.trigger_type] ?? t.trigger_type}
                    </span>
                    {!t.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">Inaktiv</span>}
                  </div>
                  {t.description && <p className="text-sm text-slate-400">{t.description}</p>}
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{t.caption_prompt}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(t)}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    {t.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function TemplateEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<Template> & { id?: string };
  onSave: (t: Partial<Template> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState(initial);
  const [hashtagsText, setHashtagsText] = useState((initial.default_hashtags ?? []).join(' '));

  function update<K extends keyof Template>(key: K, value: Template[K]) {
    setT((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(p: string) {
    const platforms = t.platforms ?? [];
    update('platforms', platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p]);
  }

  function submit() {
    const hashtags = hashtagsText.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`));
    onSave({ ...t, default_hashtags: hashtags });
  }

  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5">
      <h2 className="font-semibold text-white mb-3">{initial.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Name</label>
      <input
        type="text"
        value={t.name ?? ''}
        onChange={(e) => update('name', e.target.value)}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Beschreibung (optional)</label>
      <input
        type="text"
        value={t.description ?? ''}
        onChange={(e) => update('description', e.target.value)}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Trigger</label>
      <select
        value={t.trigger_type ?? 'manual'}
        onChange={(e) => update('trigger_type', e.target.value)}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      >
        {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Plattformen</label>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={(t.platforms ?? []).includes('facebook')} onChange={() => togglePlatform('facebook')} />
          Facebook
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={(t.platforms ?? []).includes('instagram')} onChange={() => togglePlatform('instagram')} />
          Instagram
        </label>
      </div>

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
        Caption-Prompt (Claude) — Platzhalter mit {`{name}`} ersetzbar
      </label>
      <textarea
        value={t.caption_prompt ?? ''}
        onChange={(e) => update('caption_prompt', e.target.value)}
        rows={6}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono text-xs"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
        Bild-Prompt (DALL-E, optional) — leer lassen für kein Bild
      </label>
      <textarea
        value={t.image_prompt ?? ''}
        onChange={(e) => update('image_prompt', e.target.value)}
        rows={3}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono text-xs"
      />

      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Standard-Hashtags</label>
      <input
        type="text"
        value={hashtagsText}
        onChange={(e) => setHashtagsText(e.target.value)}
        placeholder="#actioncam #cam2rent"
        className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
      />

      <div className="flex gap-2">
        <button type="button" onClick={submit} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500">
          Speichern
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-semibold text-sm hover:bg-slate-600">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
