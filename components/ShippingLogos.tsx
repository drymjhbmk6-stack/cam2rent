import Image from 'next/image';

type Size = 'sm' | 'md';

const SIZE_CONFIG: Record<Size, { width: number; height: number; gap: string }> = {
  sm: { width: 56, height: 24, gap: 'gap-2' },
  md: { width: 80, height: 32, gap: 'gap-3' },
};

interface Props {
  size?: Size;
  label?: string;
  className?: string;
}

export default function ShippingLogos({ size = 'md', label, className = '' }: Props) {
  const { width, height, gap } = SIZE_CONFIG[size];
  return (
    <div className={`flex items-center ${gap} ${className}`}>
      {label && (
        <span className="font-body text-xs sm:text-sm text-brand-steel dark:text-gray-400">
          {label}
        </span>
      )}
      <Image
        src="/logos/shipping/dhl.svg"
        alt="DHL Versandpartner"
        width={width}
        height={height}
        className="h-auto w-auto"
        style={{ height: `${height}px`, width: 'auto' }}
        unoptimized
      />
      <Image
        src="/logos/shipping/dpd.svg"
        alt="DPD Versandpartner"
        width={width}
        height={height}
        className="h-auto w-auto"
        style={{ height: `${height}px`, width: 'auto' }}
        unoptimized
      />
    </div>
  );
}
