import Image from 'next/image';

type Size = 'sm' | 'md';
type Variant = 'color' | 'light';

// Hoehen pro Variante (Breite folgt aus Aspect-Ratio des Original-Logos).
const HEIGHT: Record<Size, number> = {
  sm: 20,
  md: 28,
};

// Original-Aspect-Ratios der mitgelieferten Logo-Dateien.
// DHL nutzt die BF-Variante (Brand Frame, gelbe Box) — dadurch ueberall
// als DHL erkennbar, auch auf dunklem Hintergrund.
const DHL_RATIO = 900 / 299;     // ~3.01
const DPD_RATIO = 4097 / 1822;   // ~2.25

interface Props {
  size?: Size;
  variant?: Variant;
  label?: string;
  className?: string;
}

export default function ShippingLogos({
  size = 'md',
  variant = 'color',
  label,
  className = '',
}: Props) {
  const h = HEIGHT[size];
  const dhlW = Math.round(h * DHL_RATIO);
  const dpdW = Math.round(h * DPD_RATIO);
  const gap = size === 'sm' ? 'gap-3' : 'gap-4';

  const dhlSrc = variant === 'light' ? '/logos/shipping/dhl-white.svg' : '/logos/shipping/dhl.svg';
  const dpdSrc = variant === 'light' ? '/logos/shipping/dpd-white.png' : '/logos/shipping/dpd.png';

  return (
    <div className={`flex items-center ${gap} ${className}`}>
      {label && (
        <span className="font-body text-xs sm:text-sm text-brand-steel dark:text-gray-400">
          {label}
        </span>
      )}
      <Image
        src={dhlSrc}
        alt="DHL Versandpartner"
        width={dhlW}
        height={h}
        style={{ height: `${h}px`, width: `${dhlW}px` }}
        unoptimized
        priority={false}
      />
      <Image
        src={dpdSrc}
        alt="DPD Versandpartner"
        width={dpdW}
        height={h}
        style={{ height: `${h}px`, width: `${dpdW}px` }}
        unoptimized
        priority={false}
      />
    </div>
  );
}
