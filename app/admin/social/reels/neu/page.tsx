'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: 'stock_footage' | 'motion_graphics';
  default_duration: number;
}

interface Account {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username: string | null;
  is_active: boolean;
}

export default function NewReelPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [topic, setTopic] = useState('');
  const [productName, setProductName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [fbAccountId, setFbAccountId] = useState('');
  const [igAccountId, setIgAccountId] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/admin/reels/templates').then((r) => r.json()).catch(() => ({ templates: [] })),
        fetch('/api/admin/social/accounts').then((r) => r.json()).catch(() => ({ accounts: [] })),
      ]);
      setTemplates(tRes.templates ?? []);
      setAccounts(aRes.accounts ?? []);
      if (tRes.templates?.[0]) setTemplateId(tRes.templates[0].id);
      const fb = (aRes.accounts ?? []).find((a: Account) => a.platform === 'facebook' && a.is_active);
      const ig = (aRes.accounts ?? []).find((a: Account) => a.platform === 'instagram' && a.is_active);
      if (fb) setFbAccountId(fb.id);
      if (ig) setIgAccountId(ig.id);
    })();
  }, []);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Topic ist Pflicht');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          templateId,
          productName: productName || undefined,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          platforms,
          fbAccountId: platforms.includes('facebook') ? fbAccountId || null : null,
          igAccountId: platforms.includes('instagram') ? igAccountId || null : null,
        }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        setError(body.error ?? 'Unbekannter Fehler');
        setSubmitting(false);
        return;
      }
      // Auf Detail-Seite springen sobald ID da ist, sonst auf Liste
      if (body.reelId) {
        router.push(`/admin/social/reels/${body.reelId}`);
      } else {
        router.push('/admin/social/reels');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
      setSubmitting(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white mb-2">Neues Reel generieren</h1>
      <p className="text-sm text-brand-steel dark:text-gray-400 mb-8">
        Claude schreibt das Skript, Pexels liefert die Stock-Clips, FFmpeg rendert — du siehst das Ergebnis anschließend und kannst vor der Veröffentlichung entscheiden.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {/* Vorlage */}
        <div>
          <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Vorlage</label>
          {templates.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Keine Vorlagen gefunden. Lege zuerst mindestens eine an unter{' '}
              <Link href="/admin/social/reels/vorlagen" className="underline">Vorlagen</Link>.
            </p>
          ) : (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.template_type === 'stock_footage' ? 'Stock-Footage' : 'Motion-Graphics'}, {t.default_duration}s)
                </option>
              ))}
            </select>
          )}
          {selectedTemplate?.description && (
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-2">{selectedTemplate.description}</p>
          )}
        </div>

        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Topic / Aussage *</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="z.B. GoPro Hero 13 für Mountainbike-Touren im Frühling"
            required
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
          />
        </div>

        {/* Produkt (optional) */}
        <div>
          <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Kamera (optional)</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="z.B. GoPro Hero 13 Black"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Keywords (komma-getrennt)</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="mountainbiking, trail, action, adventure"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
          />
          <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Hilft Claude beim Erzeugen passender Pexels-Suchbegriffe. Englische Begriffe funktionieren besser.</p>
        </div>

        {/* Plattformen */}
        <div>
          <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Plattformen</label>
          <div className="flex gap-3">
            {(['facebook', 'instagram'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                <span className="text-sm text-brand-dark dark:text-white capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Accounts */}
        {platforms.includes('facebook') && (
          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Facebook-Seite</label>
            <select
              value={fbAccountId}
              onChange={(e) => setFbAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            >
              <option value="">— keine —</option>
              {accounts.filter((a) => a.platform === 'facebook').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {platforms.includes('instagram') && (
          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Instagram-Account</label>
            <select
              value={igAccountId}
              onChange={(e) => setIgAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            >
              <option value="">— keiner —</option>
              {accounts.filter((a) => a.platform === 'instagram').map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username ?? a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-brand-steel dark:text-gray-500">Der Render dauert typisch 30–90 Sekunden. Du kannst die Seite verlassen und später in der Liste sehen, ob das Reel fertig ist.</p>
          <button
            type="submit"
            disabled={submitting || templates.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-orange/90 disabled:opacity-50"
          >
            {submitting ? 'Starte Render…' : 'Reel generieren'}
          </button>
        </div>
      </form>
    </div>
  );
}
