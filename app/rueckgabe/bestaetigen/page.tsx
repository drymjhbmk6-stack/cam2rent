import type { Metadata } from 'next';
import { Suspense } from 'react';
import RueckgabeBestaetigenClient from './RueckgabeBestaetigenClient';

export const metadata: Metadata = {
  title: 'Rückmeldung zu deiner Rückgabe | cam2rent',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RueckgabeBestaetigenClient />
    </Suspense>
  );
}
