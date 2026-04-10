'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { SeasonalImage } from '@/lib/seasonal-themes';

/**
 * Wiederverwendbarer Seiten-Header mit optionalem saisonalem Hintergrundbild.
 * Fallback: Dunkler Hintergrund ohne Bild.
 */
export default function SeasonalPageHeader({
  zone,
  title,
  subtitle,
}: {
  zone: string;
  title: string;
  subtitle?: string;
}) {
  const [image, setImage] = useState<SeasonalImage | null>(null);

  useEffect(() => {
    fetch(`/api/seasonal-images?zone=${zone}`)
      .then((r) => r.json())
      .then((d) => { if (d.image) setImage(d.image); })
      .catch(() => {});
  }, [zone]);

  return (
    <section className="relative bg-brand-black dark:bg-gray-950 text-white py-20 overflow-hidden">
      {image && (
        <>
          <Image
            src={image.url}
            alt={image.alt || title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl mb-4">
          {title}
        </h1>
        {subtitle && (
          <p className="font-body text-lg text-gray-300 max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
        {image?.source === 'unsplash' && image.photographer && (
          <div className="absolute bottom-3 right-4 px-2 py-1 rounded bg-black/40 backdrop-blur-sm">
            <span className="text-[10px] text-white/50 font-body">
              Foto: {image.photographer}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
