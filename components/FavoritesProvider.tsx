'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface FavoritesContextType {
  favorites: Set<string>;
  loading: boolean;
  toggleFavorite: (productId: string) => Promise<void>;
  isFavorited: (productId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: new Set(),
  loading: true,
  toggleFavorite: async () => {},
  isFavorited: () => false,
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load favorites when user changes
  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/favorites');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setFavorites(new Set(data.favorites.map((f: { product_id: string }) => f.product_id)));
          }
        }
      } catch {
        // Silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isFavorited = useCallback(
    (productId: string) => favorites.has(productId),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (productId: string) => {
      if (!user) return;

      // Optimistic update
      const wasFavorited = favorites.has(productId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.delete(productId);
        else next.add(productId);
        return next;
      });

      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId }),
        });
        if (!res.ok) throw new Error();
      } catch {
        // Revert on error
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFavorited) next.add(productId);
          else next.delete(productId);
          return next;
        });
      }
    },
    [user, favorites]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, loading, toggleFavorite, isFavorited }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
