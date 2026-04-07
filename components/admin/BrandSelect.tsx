'use client';

import DynamicSelect from './DynamicSelect';

const DEFAULT_BRANDS = ['GoPro', 'DJI', 'Insta360', 'Sonstige'];

interface BrandSelectProps {
  value: string;
  onChange: (brand: string) => void;
}

export default function BrandSelect({ value, onChange }: BrandSelectProps) {
  return (
    <DynamicSelect
      value={value}
      onChange={onChange}
      settingsKey="camera_brands"
      defaults={DEFAULT_BRANDS}
      addLabel="+ Neue Marke..."
      placeholder="Markenname"
    />
  );
}
