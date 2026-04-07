'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useProducts } from '@/components/ProductsProvider';

type ProductImagesMap = Record<string, string[]>;

const ProductImagesContext = createContext<ProductImagesMap>({});

export function ProductImagesProvider({ children }: { children: ReactNode }) {
  const { products } = useProducts();

  const images = useMemo(() => {
    const map: ProductImagesMap = {};
    for (const p of products) {
      if (p.images?.length > 0) {
        map[p.id] = p.images;
      }
    }
    return map;
  }, [products]);

  return (
    <ProductImagesContext.Provider value={images}>
      {children}
    </ProductImagesContext.Provider>
  );
}

export function useProductImages(): ProductImagesMap {
  return useContext(ProductImagesContext);
}

export function useProductImage(productId: string): string | undefined {
  const images = useContext(ProductImagesContext);
  return images[productId]?.[0];
}

export function useProductImageAll(productId: string): string[] {
  const images = useContext(ProductImagesContext);
  return images[productId] ?? [];
}
