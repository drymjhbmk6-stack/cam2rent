import { getProducts } from '@/lib/get-products';
import KamerasClient from './KamerasClient';

// ISR-Cache: max. 60 Sek alt. Der ProductsProvider aktualisiert nach der
// Hydration ohnehin auf den Live-Stand — der server-gerenderte Grid ist nur
// der erste sichtbare Frame (kein leeres Grid-→-/api/products-Waterfall mehr).
export const revalidate = 60;

export default async function KamerasPage() {
  const initialProducts = await getProducts();
  return <KamerasClient initialProducts={initialProducts} />;
}
