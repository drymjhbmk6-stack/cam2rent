'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface KameraResult {
  id: string;
  name: string;
  slug: string;
  brand: string;
  image: string;
  pricePerDay: number;
  available: boolean;
}

interface SimpleResult {
  id: string;
  name: string;
  description: string;
}

interface SearchResults {
  kameras: KameraResult[];
  zubehoer: SimpleResult[];
  sets: SimpleResult[];
}

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Debounced search
  const search = useCallback((q: string) => {
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data: SearchResults = await res.json();
        setResults(data);
        setActiveIndex(-1);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    search(val);
  };

  // Build flat list for keyboard nav
  const flatItems: { href: string; label: string }[] = [];
  if (results) {
    results.kameras.forEach((k) =>
      flatItems.push({ href: `/kameras/${k.slug}`, label: k.name })
    );
    results.zubehoer.forEach((z) =>
      flatItems.push({ href: `/kameras`, label: z.name })
    );
    results.sets.forEach((s) =>
      flatItems.push({ href: `/kameras`, label: s.name })
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && flatItems[activeIndex]) {
      e.preventDefault();
      navigate(flatItems[activeIndex].href);
    }
  };

  const navigate = (href: string) => {
    onClose();
    router.push(href);
  };

  if (!open) return null;

  const hasResults =
    results &&
    (results.kameras.length > 0 ||
      results.zubehoer.length > 0 ||
      results.sets.length > 0);
  const noResults = results && !hasResults && query.length >= 2;

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-[15%] z-[101] flex justify-center px-4 animate-fadeIn">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-brand-border dark:border-gray-700 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border dark:border-gray-700">
            <svg
              className="w-5 h-5 text-brand-steel dark:text-gray-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Kamera, Zubehoer oder Set suchen..."
              className="flex-1 text-sm font-body text-brand-black dark:text-gray-100 placeholder:text-brand-muted dark:placeholder:text-gray-500 outline-none bg-transparent"
              autoComplete="off"
            />
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-brand-muted dark:text-gray-500 bg-brand-bg dark:bg-gray-700 border border-brand-border dark:border-gray-600 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && query.length >= 2 && (
              <div className="px-4 py-6 text-center">
                <div className="inline-block w-5 h-5 border-2 border-brand-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            )}

            {noResults && !loading && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-body text-brand-steel dark:text-gray-400">
                  Keine Ergebnisse fuer &quot;{query}&quot;
                </p>
                <p className="text-xs font-body text-brand-muted dark:text-gray-500 mt-1">
                  Versuch es mit einem anderen Suchbegriff
                </p>
              </div>
            )}

            {hasResults && !loading && (
              <div className="py-2">
                {/* Kameras */}
                {results.kameras.length > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider text-brand-muted">
                      Kameras
                    </p>
                    {results.kameras.map((k) => {
                      const idx = flatIndex++;
                      return (
                        <button
                          key={k.id}
                          onClick={() => navigate(`/kameras/${k.slug}`)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            idx === activeIndex
                              ? 'bg-accent-blue-soft dark:bg-accent-blue/10'
                              : 'hover:bg-brand-bg dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-brand-bg dark:bg-brand-black flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-5 h-5 text-brand-steel dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-medium text-brand-black dark:text-white truncate">
                              {k.name}
                            </p>
                            <p className="text-xs font-body text-brand-steel dark:text-gray-400">
                              {k.brand} &middot; ab {k.pricePerDay.toFixed(2).replace('.', ',')} &euro;/Tag
                              {!k.available && (
                                <span className="ml-1.5 text-status-error">
                                  &middot; nicht verfuegbar
                                </span>
                              )}
                            </p>
                          </div>
                          <svg
                            className="w-4 h-4 text-brand-muted flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Zubehoer */}
                {results.zubehoer.length > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider text-brand-muted mt-1">
                      Zubehoer
                    </p>
                    {results.zubehoer.map((z) => {
                      const idx = flatIndex++;
                      return (
                        <button
                          key={z.id}
                          onClick={() => navigate('/kameras')}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            idx === activeIndex
                              ? 'bg-accent-blue-soft dark:bg-accent-blue/10'
                              : 'hover:bg-brand-bg dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-brand-bg dark:bg-brand-black flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-5 h-5 text-brand-steel dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-medium text-brand-black dark:text-white truncate">
                              {z.name}
                            </p>
                            <p className="text-xs font-body text-brand-steel dark:text-gray-400 truncate">
                              {z.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Sets */}
                {results.sets.length > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider text-brand-muted mt-1">
                      Sets &amp; Pakete
                    </p>
                    {results.sets.map((s) => {
                      const idx = flatIndex++;
                      return (
                        <button
                          key={s.id}
                          onClick={() => navigate('/kameras')}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            idx === activeIndex
                              ? 'bg-accent-blue-soft dark:bg-accent-blue/10'
                              : 'hover:bg-brand-bg dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-brand-bg dark:bg-brand-black flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-5 h-5 text-brand-steel dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-medium text-brand-black dark:text-white truncate">
                              {s.name}
                            </p>
                            <p className="text-xs font-body text-brand-steel dark:text-gray-400 truncate">
                              {s.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Default state */}
            {!results && !loading && query.length < 2 && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs font-body text-brand-muted">
                  Mindestens 2 Zeichen eingeben
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-brand-border dark:border-gray-700 bg-brand-bg/50 dark:bg-gray-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-body text-brand-muted dark:text-gray-500">
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-brand-border dark:border-gray-600 rounded text-[9px] font-mono">
                &uarr;&darr;
              </kbd>
              <span>navigieren</span>
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-brand-border dark:border-gray-600 rounded text-[9px] font-mono">
                &crarr;
              </kbd>
              <span>öffnen</span>
            </div>
            <button
              onClick={onClose}
              className="text-[10px] font-body text-brand-muted dark:text-gray-500 hover:text-brand-text dark:hover:text-gray-300 transition-colors"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
