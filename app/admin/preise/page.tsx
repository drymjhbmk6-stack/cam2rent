'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import VersandpreiseContent from '@/components/admin/VersandpreiseContent';
import HaftungContent from '@/components/admin/HaftungContent';

type TabKey = 'versand' | 'haftung';

function TabButton({ tab, current, label }: { tab: TabKey; current: TabKey; label: string }) {
  const active = tab === current;
  return (
    <Link
      href={`/admin/preise?tab=${tab}`}
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

function PreisePageInner() {
  const searchParams = useSearchParams();
  const current: TabKey = searchParams.get('tab') === 'haftung' ? 'haftung' : 'versand';

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-2">
          <TabButton tab="versand" current={current} label="Versand" />
          <TabButton tab="haftung" current={current} label="Haftung & Kaution" />
        </div>
      </div>
      {current === 'versand' ? <VersandpreiseContent /> : <HaftungContent />}
    </div>
  );
}

export default function AdminPreisePage() {
  return (
    <Suspense fallback={null}>
      <PreisePageInner />
    </Suspense>
  );
}
