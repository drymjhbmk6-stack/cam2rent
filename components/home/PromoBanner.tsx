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

/** Mischt Weiß/Schwarz in eine Farbe für den Gradient-Zweiter-Stop */
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
  const gradientEnd = shiftColor(banner.bgColor, textMode === 'white' ? -35 : +35);

  return (
    <div
      role="banner"
      style={{
        background: `linear-gradient(135deg, ${banner.bgColor} 0%, ${gradientEnd} 100%)`,
        color: textHex,
        /* Diagonale Unterkante: rechts oben, links tiefer */
        clipPath: 'polygon(0 0, 100% 0, 100% 68%, 0 100%)',
        paddingBottom: '3.5rem', /* Platz für die schräge Fläche */
      }}
      className="w-full relative overflow-hidden"
    >
      {/* Diagonal-Dekoration: Schräge Linie als SVG-Overlay */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <polygon
          points="65,0 100,0 100,100 35,0"
          fill="white"
          fillOpacity="0.05"
        />
        <polygon
          points="80,0 100,0 100,60"
          fill="white"
          fillOpacity="0.05"
        />
      </svg>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-3 sm:pt-5 sm:pb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <p
            className="font-heading font-extrabold text-xl sm:text-2xl md:text-3xl leading-tight tracking-tight"
            style={{ color: textHex, textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
          >
            {banner.headline}
          </p>
          {banner.subline && (
            <p
              className="font-body text-sm sm:text-base mt-1"
              style={{ color: textHex, opacity: 0.85 }}
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
            }}
            className="shrink-0 px-7 py-3 rounded-full font-heading font-extrabold text-sm sm:text-base whitespace-nowrap hover:opacity-90 active:scale-95 transition-all shadow-lg"
          >
            {banner.ctaLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}
