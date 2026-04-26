'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import EinstellungenAllgemein from '@/components/admin/EinstellungenAllgemein';
import VersandpreiseContent from '@/components/admin/VersandpreiseContent';
import HaftungContent from '@/components/admin/HaftungContent';
import VertragsparagraphenContent from '@/components/admin/VertragsparagraphenContent';
import BlogEinstellungenContent from '@/components/admin/BlogEinstellungenContent';
import SocialEinstellungenContent from '@/components/admin/SocialEinstellungenContent';

type TabKey =
  | 'allgemein'
  | 'versand'
  | 'haftung'
  | 'vertrag'
  | 'blog-ki'
  | 'social-ki';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'allgemein', label: 'Allgemein' },
  { key: 'versand', label: 'Versand' },
  { key: 'haftung', label: 'Haftung & Kaution' },
  { key: 'vertrag', label: 'Vertragsparagraphen' },
  { key: 'blog-ki', label: 'Blog-KI' },
  { key: 'social-ki', label: 'Social-KI' },
];

function isValidTab(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

function TabButton({ tab, current, label }: { tab: TabKey; current: TabKey; label: string }) {
  const active = tab === current;
  return (
    <Link
      href={`/admin/einstellungen?tab=${tab}`}
      scroll={false}
      className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all whitespace-nowrap"
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

function EinstellungenPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const current: TabKey = isValidTab(tabParam) ? tabParam : 'allgemein';

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 max-w-5xl mx-auto">
        <AdminBackLink label="Zurück" />
        <h1 className="font-heading font-bold text-xl mb-1" style={{ color: '#e2e8f0' }}>
          Einstellungen
        </h1>
        <p className="text-sm mb-5" style={{ color: '#64748b' }}>
          Alle Shop-Konfigurationen an einer Stelle
        </p>
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map((t) => (
            <TabButton key={t.key} tab={t.key} current={current} label={t.label} />
          ))}
        </div>
      </div>

      {current === 'allgemein' && <EinstellungenAllgemein />}
      {current === 'versand' && <VersandpreiseContent />}
      {current === 'haftung' && <HaftungContent />}
      {current === 'vertrag' && <VertragsparagraphenContent />}
      {current === 'blog-ki' && <BlogEinstellungenContent />}
      {current === 'social-ki' && <SocialEinstellungenContent />}
    </div>
  );
}

export default function EinstellungenPage() {
  return (
    <Suspense fallback={null}>
      <EinstellungenPageInner />
    </Suspense>
  );
}
