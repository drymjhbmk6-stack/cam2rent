'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { accessories as staticAccessories, type Accessory } from '@/data/accessories';

interface AccessoriesContextType {
  accessories: Accessory[];
  loading: boolean;
  getById: (id: string) => Accessory | undefined;
}

const AccessoriesContext = createContext<AccessoriesContextType>({
  accessories: staticAccessories,
  loading: true,
  getById: (id) => staticAccessories.find((a) => a.id === id),
});

export function AccessoriesProvider({ children }: { children: ReactNode }) {
  const [accessories, setAccessories] = useState<Accessory[]>(staticAccessories);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/accessories')
      .then((r) => r.json())
      .then((data: Accessory[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setAccessories(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getById = (id: string) => accessories.find((a) => a.id === id);

  return (
    <AccessoriesContext.Provider value={{ accessories, loading, getById }}>
      {children}
    </AccessoriesContext.Provider>
  );
}

export function useAccessories() {
  return useContext(AccessoriesContext);
}
