'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: 'stock_footage' | 'motion_graphics';
  script_prompt: string;
  default_duration: number;
  default_hashtags: string[];
  bg_color_from: string;
  bg_color_to: string;
  trigger_type: string | null;
  is_active: boolean;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/reels/templates');
    const body = await res.json();
    setTemplates(body.templates ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(id: string | null, data: Partial<Template>) {
    const isNew = id === null;
    const url = isNew ? '/api/admin/reels/templates' : `/api/admin/reels/templates/${id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await load();
      setEditingId(null);
      setCreating(false);
    } else {
      const body = await res.json();
      alert(`Fehler: ${body.error ?? 'unbekannt'}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    const res = await fetch(`/api/admin/reels/templates/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white">Reel-Vorlagen</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white"
        >
          + Neue Vorlage
        </button>
      </div>

      {loading ? (
        <p className="text-center text-brand-steel dark:text-gray-400 py-8">Lade…</p>
      ) : (
        <div className="space-y-4">
          {creating && <TemplateForm onSave={(data) => handleSave(null, data)} onCancel={() => setCreating(false)} />}
          {templates.map((t) =>
            editingId === t.id ? (
              <TemplateForm
                key={t.id}
                initial={t}
                onSave={(data) => handleSave(t.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-brand-dark dark:text-white">{t.name}</h3>
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-brand-steel dark:text-gray-300 rounded px-2 py-0.5">
                        {t.template_type === 'stock_footage' ? 'Stock' : 'Motion'}
                      </span>
                      {!t.is_active && <span className="text-xs text-red-600 dark:text-red-400">inaktiv</span>}
                    </div>
                    {t.description && <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">{t.description}</p>}
                    <p className="text-xs text-brand-steel dark:text-gray-500 mt-2">
                      {t.default_duration}s · {t.default_hashtags.join(', ') || 'keine Default-Hashtags'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(t.id)} className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline">Bearbeiten</button>
                    <button onClick={() => handleDelete(t.id)} className="text-sm text-red-600 dark:text-red-400 hover:underline">Löschen</button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Template>;
  onSave: (data: Partial<Template>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [templateType, setTemplateType] = useState<'stock_footage' | 'motion_graphics'>(initial?.template_type ?? 'stock_footage');
  const [scriptPrompt, setScriptPrompt] = useState(initial?.script_prompt ?? '');
  const [defaultDuration, setDefaultDuration] = useState(initial?.default_duration ?? 20);
  const [hashtagsText, setHashtagsText] = useState((initial?.default_hashtags ?? []).join(', '));
  const [bgColorFrom, setBgColorFrom] = useState(initial?.bg_color_from ?? '#3B82F6');
  const [bgColorTo, setBgColorTo] = useState(initial?.bg_color_to ?? '#1E40AF');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  return (
    <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-xl border border-cyan-200 dark:border-cyan-900 p-4 space-y-3">
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      />
      <input
        type="text"
        placeholder="Kurzbeschreibung"
        value={description ?? ''}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <select
          value={templateType}
          onChange={(e) => setTemplateType(e.target.value as 'stock_footage' | 'motion_graphics')}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        >
          <option value="stock_footage">Stock-Footage (Pexels)</option>
          <option value="motion_graphics">Motion-Graphics (Farbe + Text)</option>
        </select>
        <input
          type="number"
          placeholder="Dauer in s"
          value={defaultDuration}
          onChange={(e) => setDefaultDuration(Number(e.target.value))}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
      </div>
      <textarea
        placeholder="Skript-Prompt für Claude (mit Platzhaltern wie {topic}, {product_name}, {keywords})"
        value={scriptPrompt}
        onChange={(e) => setScriptPrompt(e.target.value)}
        rows={6}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono"
      />
      <input
        type="text"
        placeholder="Standard-Hashtags (komma-getrennt)"
        value={hashtagsText}
        onChange={(e) => setHashtagsText(e.target.value)}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      />
      {templateType === 'motion_graphics' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex items-center gap-2">
            <span className="w-24">Farbe oben:</span>
            <input type="color" value={bgColorFrom} onChange={(e) => setBgColorFrom(e.target.value)} />
            <input type="text" value={bgColorFrom} onChange={(e) => setBgColorFrom(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs flex-1" />
          </label>
          <label className="text-sm flex items-center gap-2">
            <span className="w-24">Farbe CTA:</span>
            <input type="color" value={bgColorTo} onChange={(e) => setBgColorTo(e.target.value)} />
            <input type="text" value={bgColorTo} onChange={(e) => setBgColorTo(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs flex-1" />
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Aktiv (kann im Generator ausgewählt werden)</span>
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm">Abbrechen</button>
        <button
          onClick={() =>
            onSave({
              name,
              description,
              template_type: templateType,
              script_prompt: scriptPrompt,
              default_duration: defaultDuration,
              default_hashtags: hashtagsText.split(',').map((s) => s.trim()).filter(Boolean),
              bg_color_from: bgColorFrom,
              bg_color_to: bgColorTo,
              is_active: isActive,
            })
          }
          className="rounded bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm text-white"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}
