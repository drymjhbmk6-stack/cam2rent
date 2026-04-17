'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ShopUpdaterContent from '@/components/admin/ShopUpdaterContent';
import SeasonalImagesContent from '@/components/admin/SeasonalImagesContent';

type TabKey = 'inhalte' | 'bilder';

function TabButton({ tab, current, label }: { tab: TabKey; current: TabKey; label: string }) {
  const active = tab === current;
  return (
    <Link
      href={`/admin/startseite?tab=${tab}`}
      scroll={false}
      className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
      style={
        active
          ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }
          : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
      }
    >
      {label}
    </Link>
  );
}

function StartseitePageInner() {
  const searchParams = useSearchParams();
  const current: TabKey = searchParams.get('tab') === 'bilder' ? 'bilder' : 'inhalte';

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-2">
          <TabButton tab="inhalte" current={current} label="Inhalte" />
          <TabButton tab="bilder" current={current} label="Hero-Bilder" />
        </div>
      </div>
      {current === 'inhalte' ? <ShopUpdaterContent /> : <SeasonalImagesContent />}
    </div>
  );
}

export default function StartseitePage() {
  return (
    <Suspense fallback={null}>
      <StartseitePageInner />
    </Suspense>
  );
}
