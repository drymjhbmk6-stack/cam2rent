'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ProductImagesMap = Record<string, string[]>;

const ProductImagesContext = createContext<ProductImagesMap>({});

let cachedImages: ProductImagesMap | null = null;
let fetchPromise: Promise<ProductImagesMap> | null = null;

function fetchProductImages(): Promise<ProductImagesMap> {
  if (cachedImages) return Promise.resolve(cachedImages);
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/prices')
    .then((r) => r.json())
    .then((d) => {
      const imgs: ProductImagesMap = {};
      const ap = d.adminProducts;
      if (ap) {
        Object.keys(ap).forEach((id) => {
          if (ap[id]?.images?.length > 0) {
            imgs[id] = ap[id].images;
          }
        });
      }
      cachedImages = imgs;
      return imgs;
    })
    .catch(() => {
      fetchPromise = null;
      return {};
    });

  return fetchPromise;
}

export function ProductImagesProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<ProductImagesMap>(cachedImages ?? {});

  useEffect(() => {
    fetchProductImages().then((imgs) => {
      setImages(imgs);
      // Erste Bilder vorausladen
      Object.values(imgs).forEach((urls) => {
        if (urls[0]) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = urls[0];
          document.head.appendChild(link);
        }
      });
    });
  }, []);

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
