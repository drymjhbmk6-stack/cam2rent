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
  accessories: string[];
  haftung: 'none' | 'standard' | 'premium';
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  subtotal: number;     // rental + accessories + haftung (ohne Versand)
  deposit: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  itemCount: number;
  cartTotal: number; // sum of subtotals (ohne Versand)
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  itemCount: 0,
  cartTotal: 0,
});

const STORAGE_KEY = 'cam2rent_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { user } = useAuth();
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Abandoned Cart Sync: Warenkorb mit Server synchronisieren (für eingeloggte User)
  useEffect(() => {
    if (!user?.id || !user?.email) return;

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
      value={{ items, addItem, removeItem, clearCart, itemCount, cartTotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
