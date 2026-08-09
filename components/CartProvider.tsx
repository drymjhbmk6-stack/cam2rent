'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/components/AuthProvider';

export interface CartItem {
  id: string;           // uuid (crypto.randomUUID)
  productId: string;
  productName: string;
  productSlug: string;
  rentalFrom: string;   // yyyy-MM-dd
  rentalTo: string;     // yyyy-MM-dd
  days: number;
  /**
   * Legacy: nur Zubehoer-IDs (string-Array). Bleibt aus Abwaerts-Kompat
   * weiter bestehen, aber `accessoryItems` ist die authoritative Quelle.
   * Wenn ein Set gewaehlt wurde, enthaelt das Array zusaetzlich die Set-ID.
   */
  accessories: string[];
  /**
   * Neu (qty-aware). Enthaelt einen Eintrag pro Zubehoer mit Stueckzahl
   * sowie — falls ein Set gewaehlt wurde — einen Eintrag mit der Set-ID.
   * Optional fuer Abwaertskompat mit alten localStorage-Carts; neue
   * Items setzen das Feld immer.
   */
  accessoryItems?: { accessory_id: string; qty: number }[];
  haftung: 'none' | 'standard' | 'premium';
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  subtotal: number;     // rental + accessories + haftung (ohne Versand)
  deposit: number;
  /**
   * Vom Kunden auf der Buchen-Seite gewaehlte Versandart. Wird im Warenkorb
   * fuer die Versandzeile angezeigt und im Checkout als Vorauswahl genommen.
   * Optional fuer Abwaertskompat mit aelteren localStorage-Carts — Default
   * an den Konsum-Stellen ist 'versand' bzw. 'standard'.
   */
  deliveryMode?: 'versand' | 'abholung';
  shippingMethod?: 'standard' | 'express';
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  itemCount: number;
  cartTotal: number; // sum of subtotals (ohne Versand)
  hydrated: boolean;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  itemCount: 0,
  cartTotal: 0,
  hydrated: false,
});

const STORAGE_KEY = 'cam2rent_cart';

/**
 * Inhalts-Signatur eines Warenkorb-Eintrags (Dedup beim Zusammenfuehren).
 * `id` ist eine zufaellige UUID und taugt nicht als Schluessel — gleicher
 * Artikel auf zwei Geraeten hat unterschiedliche IDs. Deshalb Vergleich ueber
 * Produkt + Zeitraum + Haftung + Liefer-/Versandart + Zubehoer.
 */
function cartItemKey(it: CartItem): string {
  const acc =
    (it.accessoryItems && it.accessoryItems.length
      ? it.accessoryItems.map((a) => `${a.accessory_id}:${a.qty}`)
      : [...(it.accessories ?? [])]
    )
      .slice()
      .sort()
      .join(',');
  return [
    it.productId,
    it.rentalFrom,
    it.rentalTo,
    it.haftung,
    it.deliveryMode ?? '',
    it.shippingMethod ?? '',
    acc,
  ].join('|');
}

/** Vereint lokalen + Server-Warenkorb, ohne inhaltliche Duplikate. Lokal zuerst. */
function mergeCarts(local: CartItem[], server: CartItem[]): CartItem[] {
  const seen = new Set<string>();
  const out: CartItem[] = [];
  for (const it of [...local, ...server]) {
    const key = cartItemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fuer welche User-ID wurde der Server-Warenkorb bereits geladen/gemerged.
  // Gate gegen die Race, dass der Sync (unten) bei leerem localStorage den
  // Server-Eintrag loescht, BEVOR er geladen wurde.
  const loadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Kontogebundener Warenkorb: beim Login den Server-Stand laden + mergen,
  // beim Logout den lokalen Warenkorb leeren (Server-Kopie bleibt → kommt beim
  // naechsten Login zurueck).
  useEffect(() => {
    if (!hydrated) return;
    const uid = user?.id;

    if (uid) {
      if (loadedForUserRef.current === uid) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch('/api/cart/sync');
          if (res.ok) {
            const data = await res.json();
            const serverItems: CartItem[] = Array.isArray(data?.items) ? data.items : [];
            if (!cancelled) {
              setItems((prev) => mergeCarts(prev, serverItems));
              // Erst nach erfolgreichem Laden den Sync freigeben — sonst koennte
              // ein transienter Netzfehler den Server-Warenkorb mit dem
              // (evtl. leeren) lokalen ueberschreiben.
              loadedForUserRef.current = uid;
            }
          }
          // Bei !res.ok bewusst KEIN Freigeben → naechster Render versucht erneut.
        } catch {
          /* Netzfehler: Warenkorb bleibt lokal nutzbar, Sync erst nach Erfolg. */
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Ausgeloggt: lokalen Warenkorb leeren (Server-Kopie bleibt erhalten).
    if (loadedForUserRef.current !== null) {
      loadedForUserRef.current = null;
      setItems([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, [user, hydrated]);

  // Abandoned Cart Sync: Warenkorb mit Server synchronisieren (für eingeloggte User)
  useEffect(() => {
    if (!user?.id || !user?.email) return;
    // Erst syncen, wenn der Server-Warenkorb fuer diesen User geladen wurde
    // (sonst wuerde ein frisches Geraet mit leerem Korb den Server-Stand loeschen).
    if (loadedForUserRef.current !== user.id) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(() => {
      const total = items.reduce((sum, i) => sum + i.subtotal, 0);
      fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          items,
          cartTotal: total,
        }),
      }).catch(() => {}); // Fehler leise ignorieren
    }, 2000); // 2s debounce

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [items, user]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const itemCount = items.length;
  const cartTotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, itemCount, cartTotal, hydrated }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
