'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PromoBannerData {
  headline: string;
  subline: string;
  bgColor: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  validUntil: string | null;
}

function getTextColor(hex: string): 'white' | 'black' {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? 'black' : 'white';
}

function shiftColor(hex: string, amount: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default function PromoBanner() {
  const [banner, setBanner] = useState<PromoBannerData | null>(null);

  useEffect(() => {
    fetch('/api/promo-banner')
      .then((r) => (r.ok ? r.json() : { banner: null }))
      .then((d) => setBanner(d.banner))
      .catch(() => {});
  }, []);

  if (!banner) return null;

  const textMode = getTextColor(banner.bgColor);
  const textHex = textMode === 'white' ? '#ffffff' : '#000000';
  const edgeColor = shiftColor(banner.bgColor, textMode === 'white' ? -50 : +50);

  return (
    <div
      role="banner"
      aria-label="Promotion"
      style={{
        position: 'absolute',
        top: '30%',
        left: '-12%',
        width: '124%',
        transform: 'rotate(-4deg)',
        transformOrigin: 'center',
        background: `linear-gradient(90deg,
          ${edgeColor} 0%,
          ${banner.bgColor} 15%,
          ${banner.bgColor} 85%,
          ${edgeColor} 100%)`,
        color: textHex,
        zIndex: 20,
        boxShadow: `
          0 8px 32px rgba(0,0,0,0.45),
          0 2px 6px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.18),
          inset 0 -2px 0 rgba(0,0,0,0.15)
        `,
        padding: '18px 0',
        pointerEvents: 'auto',
      }}
    >
      <div
        className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 px-4 sm:px-8 text-center mx-auto"
        style={{ maxWidth: 'min(100%, calc(100vw - 1.5rem))' }}
      >
        <div className="min-w-0 max-w-full">
          <p
            className="font-heading font-extrabold text-lg sm:text-2xl md:text-3xl leading-tight tracking-tight break-words [text-wrap:balance]"
            style={{ color: textHex, textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}
          >
            {banner.headline}
          </p>
          {banner.subline && (
            <p
              className="font-body text-xs sm:text-base mt-1 break-words [text-wrap:balance]"
              style={{ color: textHex, opacity: 0.9, textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
            >
              {banner.subline}
            </p>
          )}
        </div>

        {banner.ctaLabel && banner.ctaUrl && (
          <Link
            href={banner.ctaUrl}
            style={{
              backgroundColor: textHex,
              color: banner.bgColor,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            className="shrink-0 px-7 py-2.5 rounded-full font-heading font-extrabold text-sm sm:text-base whitespace-nowrap hover:opacity-90 active:scale-95 transition-all"
          >
            {banner.ctaLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}
