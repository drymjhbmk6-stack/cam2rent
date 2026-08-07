'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/ui';
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
          ? { background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)', border: '1px solid rgba(6,182,212,0.3)' }
          : { background: 'var(--admin-surface-2)', color: 'var(--admin-muted)', border: '1px solid var(--admin-faint)' }
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
        <PageHeader
          backLabel="Zurück"
          title="Einstellungen"
          subtitle="Alle Shop-Konfigurationen an einer Stelle"
        />
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
