'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { type Product } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import { accessories } from '@/data/accessories';

interface CustomSet {
  id: string;
  user_id: string;
  camera_id: string;
  accessory_ids: string[];
  name: string;
  created_at: string;
}

export default function KontoSetsPage() {
  const { products } = useProducts();
  const { user } = useAuth();
  const [sets, setSets] = useState<CustomSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/custom-sets?userId=${user.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.sets) setSets(d.sets); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleDelete(id: string) {
    if (!user) return;
    setDeleting(id);
    try {
      const res = await fetch('/api/custom-sets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.id }),
      });
      if (res.ok) {
        setSets((prev) => prev.filter((s) => s.id !== id));
      }
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  }

  function getCamera(cameraId: string): Product | undefined {
    return products.find((p) => p.id === cameraId);
  }

  function getAccessoryNames(ids: string[]): string[] {
    return ids
      .map((id) => accessories.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-xl text-brand-black dark:text-gray-100">
          Eigene Sets
        </h1>
        <Link
          href="/set-konfigurator"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Neues Set
        </Link>
      </div>

      {sets.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-blue-soft dark:bg-accent-blue/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="font-heading font-semibold text-brand-black dark:text-gray-100 mb-1">
            Noch keine eigenen Sets
          </p>
          <p className="text-sm text-brand-steel dark:text-gray-400 mb-4">
            Stelle dein erstes Set im Konfigurator zusammen.
          </p>
          <Link
            href="/set-konfigurator"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-600 transition-colors"
          >
            Zum Set-Konfigurator
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map((set) => {
            const camera = getCamera(set.camera_id);
            const accNames = getAccessoryNames(set.accessory_ids);

            return (
              <div
                key={set.id}
                className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-brand-black dark:text-gray-100 text-sm truncate">
                      {set.name}
                    </h3>
                    <p className="text-xs text-brand-steel dark:text-gray-400 mt-0.5">
                      Erstellt am {new Date(set.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(set.id)}
                    disabled={deleting === set.id}
                    className="text-brand-muted hover:text-status-error transition-colors p-1 flex-shrink-0"
                    aria-label="Set löschen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Camera */}
                {camera && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs font-body text-brand-muted dark:text-gray-500 uppercase">Kamera:</span>
                    <span className="text-xs font-heading font-semibold text-brand-black dark:text-gray-100">
                      {camera.name}
                    </span>
                  </div>
                )}

                {/* Accessories */}
                {accNames.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-body text-brand-muted dark:text-gray-500 uppercase">Zubehör:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {accNames.map((name, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-brand-bg dark:bg-gray-700 rounded-full text-[11px] font-body text-brand-text dark:text-gray-300"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action */}
                {camera && (
                  <div className="mt-3 pt-3 border-t border-brand-border dark:border-gray-700">
                    <Link
                      href={`/kameras/${camera.slug}/buchen${set.accessory_ids.length ? `?accessories=${set.accessory_ids.join(',')}` : ''}`}
                      className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-accent-blue hover:underline"
                    >
                      Set buchen
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
