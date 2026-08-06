'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_NAV_INDEX, type AdminNavPerm } from '@/lib/admin-nav-index';

/**
 * Admin-Command-Palette (Cmd/Ctrl+K) — Schritt 4 der Admin-Modernisierung.
 *
 * Rein additiv: ein Overlay, das über Cmd+K geöffnet wird. Zwei Ergebnis-Ebenen:
 *  1) Navigation/Schnell-Aktionen (aus `lib/admin-nav-index`, permission-gefiltert)
 *  2) globale Suche (Buchungen/Kunden/Inventar) via `/api/admin/search`
 * Token-basiert → folgt Light/Dark. Bestehendes Verhalten wird nicht berührt.
 */

type PaletteMe = { role: 'owner' | 'employee'; permissions: string[] } | null;

function canSee(me: PaletteMe, perm?: AdminNavPerm): boolean {
  if (!perm) return true;
  if (!me) return true; // solange unbekannt: zeigen (verhindert Flackern) — wie Sidebar
  if (me.role === 'owner') return true;
  return me.permissions.includes(perm);
}

interface SearchResult {
  type: string;
  typeLabel: string;
  label: string;
  sublabel?: string;
  href: string;
}

interface Item {
  kind: 'nav' | 'search';
  label: string;
  sublabel?: string;
  badge: string;
  href: string;
  accent?: boolean;
}

export default function AdminCommandPalette({ me }: { me: PaletteMe }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Globaler Cmd/Ctrl+K-Umschalter.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Öffnen per sichtbarem Such-Button (Sidebar/Mobile-Header) — v.a. für Touch,
  // wo es kein Cmd+K gibt. Der Button feuert dieses Custom-Event.
  useEffect(() => {
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener('admin:command-palette', onOpenEvent);
    return () => window.removeEventListener('admin:command-palette', onOpenEvent);
  }, []);

  // Fokus beim Öffnen, Reset beim Schließen.
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    setQuery('');
    setResults([]);
    setSearching(false);
  }, [open]);

  // Debounced globale Suche.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        /* Abbruch/Netzfehler — letzten Stand behalten */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const navItems: Item[] = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return ADMIN_NAV_INDEX.filter((e) => canSee(me, e.perm))
      .filter((e) => {
        if (!ql) return true;
        return (
          e.label.toLowerCase().includes(ql) ||
          (e.keywords ?? '').toLowerCase().includes(ql) ||
          e.group.toLowerCase().includes(ql)
        );
      })
      .slice(0, ql ? 8 : 40)
      .map((e) => ({
        kind: 'nav' as const,
        label: e.label,
        sublabel: e.group,
        badge: e.action ? 'Aktion' : 'Seite',
        href: e.href,
        accent: e.action,
      }));
  }, [me, query]);

  const searchItems: Item[] = useMemo(
    () =>
      results.map((r) => ({
        kind: 'search' as const,
        label: r.label,
        sublabel: r.sublabel,
        badge: r.typeLabel,
        href: r.href,
      })),
    [results],
  );

  const allItems: Item[] = useMemo(() => [...searchItems, ...navItems], [searchItems, navItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Aktive Zeile in den sichtbaren Bereich scrollen.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, allItems.length]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = allItems[activeIndex];
      if (it) go(it.href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Schnellsuche"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '12vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--admin-modal-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {/* Eingabe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--admin-border)' }}>
          <svg width={18} height={18} fill="none" stroke="var(--admin-muted)" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Suchen oder springen … (Buchung, Kunde, Seite)"
            aria-label="Suchen oder zu einer Seite springen"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--admin-text)',
              fontSize: 15,
            }}
          />
          <kbd style={{ fontSize: 11, color: 'var(--admin-muted-2)', border: '1px solid var(--admin-border)', borderRadius: 6, padding: '2px 6px' }}>ESC</kbd>
        </div>

        {/* Ergebnisse */}
        <div ref={listRef} style={{ maxHeight: '55vh', overflowY: 'auto', padding: 6 }}>
          {allItems.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 14 }}>
              {searching ? 'Suche …' : query.trim().length >= 2 ? 'Keine Treffer.' : 'Tippen zum Suchen …'}
            </div>
          ) : (
            allItems.map((it, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={`${it.kind}-${it.href}-${idx}`}
                  data-idx={idx}
                  type="button"
                  onClick={() => go(it.href)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: active ? 'var(--admin-accent-soft)' : 'transparent',
                    color: 'var(--admin-text)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: it.accent ? 'var(--admin-accent)' : 'var(--admin-text)' }}>
                      {it.label}
                    </span>
                    {it.sublabel && (
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--admin-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.sublabel}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: it.kind === 'search' ? 'var(--admin-accent)' : 'var(--admin-muted-2)',
                      border: '1px solid var(--admin-border)',
                      borderRadius: 6,
                      padding: '2px 7px',
                      flexShrink: 0,
                    }}
                  >
                    {it.badge}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Fußzeile */}
        <div style={{ display: 'flex', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--admin-border)', fontSize: 11, color: 'var(--admin-muted-2)' }}>
          <span>↑↓ Navigieren</span>
          <span>↵ Öffnen</span>
          <span>Cmd/Strg+K Umschalten</span>
        </div>
      </div>
    </div>
  );
}
