'use client';

/**
 * Modal zum Auswaehlen eines Bildes aus der eigenen Bibliothek (Produkte,
 * Sets, Blog, bereits hochgeladene Social-Bilder, freigegebenes Kundenmaterial).
 * Wird im Social-Editor als weitere Bild-Quelle angeboten (neben KI + PC-Upload).
 */

import { useEffect, useState } from 'react';

interface MediaItem {
  url: string;
  label: string;
  sublabel?: string;
}

type Tab = 'products' | 'sets' | 'blog' | 'social' | 'ugc';

const TAB_LABELS: Record<Tab, string> = {
  products: 'Produkte',
  sets: 'Sets',
  blog: 'Blog',
  social: 'Social-Uploads',
  ugc: 'Kundenmaterial',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export default function MediaLibraryPicker({ open, onClose, onSelect }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<Tab, MediaItem[]>>({ products: [], sets: [], blog: [], social: [], ugc: [] });
  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/social/media-library');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Fehler beim Laden');
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const items = (data[tab] ?? []).filter((item) =>
    search.trim() === '' ? true : item.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h3 className="font-semibold text-white">Aus Bibliothek wählen</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
            aria-label="Schließen"
          >
            &times;
          </button>
        </div>

        {/* Tabs + Suche */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3 border-b border-slate-800">
          <div className="flex gap-1 overflow-x-auto">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
              const count = data[t]?.length ?? 0;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    tab === t
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {TAB_LABELS[t]}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche..."
            className="flex-1 sm:ml-auto sm:max-w-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-sm"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-slate-400 text-sm">Lade Bibliothek…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-slate-500 text-sm">Keine Bilder in dieser Kategorie.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => {
                  onSelect(item.url);
                  onClose();
                }}
                className="group text-left rounded-lg overflow-hidden border border-slate-800 hover:border-cyan-500/60 bg-slate-900 transition"
                title={item.label}
              >
                <div className="aspect-square w-full bg-slate-950 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.label}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-200 truncate">{item.label}</p>
                  {item.sublabel && <p className="text-[10px] text-slate-500">{item.sublabel}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
