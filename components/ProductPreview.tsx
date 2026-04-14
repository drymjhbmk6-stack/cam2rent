'use client';

import { useState } from 'react';
import SpecIcon from '@/components/SpecIcon';
import type { AdminProduct, AdminProductSpec } from '@/lib/price-config';
import { calcPriceFromTable } from '@/lib/price-config';
import Markdown from 'react-markdown';
import { getBrandStyle } from '@/lib/brand-colors';
import { useBrandColors } from '@/hooks/useBrandColors';

function CameraPlaceholder({ brand, brandColors }: { brand: string; brandColors?: Record<string, string> }) {
  const color = getBrandStyle(brand, brandColors).color;
  return (
    <svg viewBox="0 0 160 120" fill="none" style={{ width: 80, height: 60 }} aria-hidden="true">
      <rect x="12" y="20" width="136" height="82" rx="10" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2.5" />
      <circle cx="80" cy="61" r="26" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="2.5" />
      <circle cx="80" cy="61" r="16" fill={color} fillOpacity="0.35" />
      <circle cx="80" cy="61" r="8" fill={color} fillOpacity="0.65" />
      <rect x="56" y="8" width="32" height="14" rx="4" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProductPreviewProps {
  name: string;
  brand: string;
  shortDescription: string;
  description?: string;
  specs?: AdminProductSpec[];
  product: AdminProduct;
  hasHaftungsoption: boolean;
  kautionTier: 1 | 2 | 3 | null;
  kautionAmount?: number;
  images?: string[];
  available?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductPreview({
  name,
  brand,
  shortDescription,
  description,
  specs,
  product,
  hasHaftungsoption,
  kautionTier,
  kautionAmount,
  images,
  available = true,
}: ProductPreviewProps) {
  const [activeImage, setActiveImage] = useState(0);
  const brandColorMap = useBrandColors();
  const day1Price = calcPriceFromTable(product, 1);
  const bc = getBrandStyle(brand, brandColorMap);
  const hasImages = images && images.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-brand-border overflow-hidden text-sm">
      {/* Label */}
      <div className="px-4 py-2 bg-brand-bg border-b border-brand-border">
        <p className="text-[10px] font-heading font-semibold text-brand-muted uppercase tracking-wider">
          Kunden-Vorschau
        </p>
      </div>

      {/* ── Hauptbild ── */}
      <div className="relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: '4/3', backgroundColor: bc.bg }}>
        {hasImages ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[activeImage] ?? images[0]}
            alt={name || 'Produkt'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CameraPlaceholder brand={brand} brandColors={brandColorMap} />
            <p className="text-[10px] text-brand-muted/60">Foto folgt</p>
          </div>
        )}
        {!available && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
            <span className="px-3 py-1 bg-red-500 text-white font-heading font-bold text-[10px] rounded-full">
              Ausgebucht
            </span>
          </div>
        )}
      </div>

      {/* ── Thumbnails ── */}
      {hasImages && images.length > 1 && (
        <div className="grid grid-cols-4 gap-1 p-1">
          {images.slice(0, 4).map((url, i) => (
            <button
              key={`thumb-${i}`}
              type="button"
              onClick={() => setActiveImage(i)}
              className={`aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                activeImage === i ? 'border-accent-blue' : 'border-transparent hover:border-brand-border'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Bild ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Produkt-Info ── */}
      <div className="p-4 space-y-3">
        {/* Brand badge */}
        <span className="inline-block px-2 py-0.5 text-[10px] font-heading font-semibold rounded-full uppercase tracking-wider border" style={{ color: bc.color, backgroundColor: bc.bg, borderColor: bc.border }}>
          {brand}
        </span>

        {/* Name */}
        <h3 className="font-heading font-bold text-base text-brand-black leading-tight">
          {name || 'Produktname'}
        </h3>

        {/* Short description */}
        {shortDescription && (
          <p className="text-xs font-body text-brand-muted">{shortDescription}</p>
        )}

        {/* Verfügbarkeit */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-[11px] font-body font-semibold ${available ? 'text-green-600' : 'text-red-500'}`}>
            {available ? 'Verfügbar' : 'Aktuell ausgebucht'}
          </span>
        </div>

        {/* Preis (kompakt wie Shopseite) */}
        <div className="rounded-lg bg-blue-50 border border-blue-200/50 px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-body font-semibold text-blue-500 uppercase tracking-wider">Mietpreis</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[10px] text-blue-400">ab</span>
            <span className="font-heading font-bold text-sm text-blue-600">
              {day1Price > 0 ? `${day1Price},00 €` : '-- €'}
            </span>
            <span className="text-[10px] text-blue-400">/ Tag</span>
          </div>
        </div>

        {/* Description (Markdown) */}
        {description && (
          <div className="prose prose-xs max-w-none prose-headings:font-heading prose-headings:text-brand-black prose-headings:text-xs prose-p:text-[11px] prose-p:text-brand-steel prose-li:text-[11px] prose-li:text-brand-steel prose-a:text-accent-blue font-body">
            <Markdown>{description}</Markdown>
          </div>
        )}

        {/* Kaution / Haftung info */}
        <div className="p-2.5 rounded-lg bg-brand-bg border border-brand-border">
          {hasHaftungsoption ? (
            <p className="text-[11px] font-body text-brand-muted">
              <span className="font-semibold text-brand-black">Haftungsschutz:</span>{' '}
              Standard / Premium verfügbar
            </p>
          ) : kautionTier ? (
            <p className="text-[11px] font-body text-brand-muted">
              <span className="font-semibold text-brand-black">Kaution:</span>{' '}
              {kautionAmount ? `${kautionAmount} €` : `Stufe ${kautionTier}`}
            </p>
          ) : (
            <p className="text-[11px] font-body text-brand-muted italic">Kein Haftungsmodell konfiguriert</p>
          )}
        </div>

        {/* Specs grid */}
        {specs && specs.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {specs.map((spec) => (
              <div key={spec.id} className="flex items-center gap-1.5 p-1.5 rounded-md bg-brand-bg border border-brand-border">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bc.bg, color: bc.color }}>
                  <SpecIcon iconId={spec.icon} className="w-3 h-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-heading font-semibold text-brand-muted uppercase truncate">{spec.name || 'Spec'}</p>
                  <p className="text-[10px] font-heading font-semibold text-brand-black truncate">{spec.value || '--'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preisbeispiele */}
        <div className="pt-2 border-t border-brand-border">
          <p className="text-[9px] font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1.5">Preisbeispiele</p>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {[1, 3, 7, 14, 30].map((d) => (
              <span key={d} className="text-[11px] font-body">
                <span className="text-brand-muted">{d}T:</span>{' '}
                <span className="font-semibold text-brand-black">{calcPriceFromTable(product, d)} €</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
