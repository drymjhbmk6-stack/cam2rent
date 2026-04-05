'use client';

import SpecIcon from '@/components/SpecIcon';
import type { AdminProduct, AdminProductSpec } from '@/lib/price-config';
import { calcPriceFromTable } from '@/lib/price-config';
import Markdown from 'react-markdown';

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
}

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
}: ProductPreviewProps) {
  const day1Price = calcPriceFromTable(product, 1);

  return (
    <div className="bg-white rounded-2xl border border-brand-border p-5 text-sm">
      <p className="text-[10px] font-heading font-semibold text-brand-muted uppercase tracking-wider mb-3">
        Kunden-Vorschau
      </p>

      {/* Brand badge */}
      {brand && (
        <span className="inline-block px-2 py-0.5 text-[10px] font-heading font-semibold rounded-full bg-brand-bg text-brand-muted border border-brand-border mb-2">
          {brand}
        </span>
      )}

      {/* Product name */}
      <h3 className="font-heading font-bold text-base text-brand-black leading-tight mb-1">
        {name || 'Produktname'}
      </h3>

      {/* Short description as tags */}
      {shortDescription && (
        <p className="text-xs font-body text-brand-muted mb-3">{shortDescription}</p>
      )}

      {/* Price display */}
      <div className="mb-4">
        <span className="text-lg font-heading font-bold text-brand-black">
          ab {day1Price > 0 ? `${day1Price} ` : '-- '}
        </span>
        <span className="text-xs font-body text-brand-muted">&euro;/Tag</span>
      </div>

      {/* Description */}
      {description && (
        <div className="mb-4 prose prose-xs max-w-none prose-headings:font-heading prose-headings:text-brand-black prose-headings:text-xs prose-p:text-xs prose-p:text-brand-steel prose-li:text-xs prose-li:text-brand-steel prose-a:text-accent-blue font-body">
          <Markdown>{description}</Markdown>
        </div>
      )}

      {/* Kaution / Haftung info */}
      <div className="mb-4 p-2.5 rounded-xl bg-brand-bg border border-brand-border">
        {hasHaftungsoption ? (
          <p className="text-xs font-body text-brand-muted">
            <span className="font-semibold text-brand-black">Haftungsschutz:</span>{' '}
            Standard / Premium verfügbar
          </p>
        ) : kautionTier ? (
          <p className="text-xs font-body text-brand-muted">
            <span className="font-semibold text-brand-black">Kaution:</span>{' '}
            {kautionAmount ? `${kautionAmount} \u20AC` : `Stufe ${kautionTier}`}
          </p>
        ) : (
          <p className="text-xs font-body text-brand-muted italic">Kein Haftungsmodell konfiguriert</p>
        )}
      </div>

      {/* Specs grid */}
      {specs && specs.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {specs.map((spec) => (
            <div
              key={spec.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-brand-bg border border-brand-border"
            >
              <SpecIcon iconId={spec.icon} className="w-4 h-4 text-brand-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-heading font-semibold text-brand-muted truncate">
                  {spec.name || 'Spec'}
                </p>
                <p className="text-xs font-body font-semibold text-brand-black truncate">
                  {spec.value || '--'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Price preview for selected days */}
      <div className="mt-4 pt-3 border-t border-brand-border">
        <p className="text-[10px] font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">
          Preisbeispiele
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {[1, 3, 7, 14, 30].map((d) => (
            <span key={d} className="text-xs font-body">
              <span className="text-brand-muted">{d}T:</span>{' '}
              <span className="font-semibold text-brand-black">
                {calcPriceFromTable(product, d)} &euro;
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
