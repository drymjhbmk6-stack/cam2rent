import type { FirmwareAdapter } from '../types';
import { goproAdapter } from './gopro';
import { djiAdapter } from './dji';
import { insta360Adapter } from './insta360';

const ADAPTERS: FirmwareAdapter[] = [goproAdapter, djiAdapter, insta360Adapter];

export function getAdapterForBrand(brand: string | null | undefined): FirmwareAdapter | null {
  if (!brand) return null;
  const normalized = brand.toLowerCase().replace(/\s+/g, '');
  for (const a of ADAPTERS) {
    if (a.brand.toLowerCase().replace(/\s+/g, '') === normalized) return a;
  }
  return null;
}

export function listSupportedBrands(): string[] {
  return ADAPTERS.map((a) => a.brand);
}
