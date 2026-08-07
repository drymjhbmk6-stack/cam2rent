'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/ui';
import BlogEinstellungenContent from '@/components/admin/BlogEinstellungenContent';
import SocialEinstellungenContent from '@/components/admin/SocialEinstellungenContent';
import ReelsEinstellungenContent from '@/components/admin/ReelsEinstellungenContent';

type Tab = 'blog' | 'posts' | 'reels';

const TABS: { key: Tab; label: string }[] = [
  { key: 'blog', label: 'Blog' },
  { key: 'posts', label: 'Posts' },
  { key: 'reels', label: 'Reels' },
];

function ContentEinstellungenInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get('tab') ?? 'blog') as Tab;

  function setTab(t: Tab) {
    router.replace(`/admin/content/einstellungen?tab=${t}`);
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <PageHeader backLabel="Einstellungen" title="Content-Einstellungen" />

      {/* Tab-Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              background: tab === t.key ? '#FF5C00' : 'var(--admin-surface-2)',
              color: tab === t.key ? '#fff' : 'var(--admin-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      {tab === 'blog' && <BlogEinstellungenContent />}
      {tab === 'posts' && <SocialEinstellungenContent />}
      {tab === 'reels' && <ReelsEinstellungenContent />}
    </div>
  );
}

export default function ContentEinstellungenPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--admin-muted)' }}>Lade…</div>}>
      <ContentEinstellungenInner />
    </Suspense>
  );
}
