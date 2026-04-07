'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Product } from '@/data/products';

interface ProductsContextType {
  products: Product[];
  loading: boolean;
  getById: (id: string) => Product | undefined;
  getBySlug: (slug: string) => Product | undefined;
}

const ProductsContext = createContext<ProductsContextType>({
  products: [],
  loading: true,
  getById: () => undefined,
  getBySlug: () => undefined,
});

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data: Product[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getById = (id: string) => products.find((p) => p.id === id);
  const getBySlug = (slug: string) => products.find((p) => p.slug === slug);

  return (
    <ProductsContext.Provider value={{ products, loading, getById, getBySlug }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
