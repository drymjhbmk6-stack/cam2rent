'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
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
      <AdminBackLink label="Einstellungen" />

      <div className="flex items-center gap-3 mb-6 mt-2">
        <h1 style={{ color: '#f8fafc', fontSize: 22, fontWeight: 700, margin: 0 }}>
          Content-Einstellungen
        </h1>
      </div>

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
              background: tab === t.key ? '#FF5C00' : '#1e293b',
              color: tab === t.key ? '#fff' : '#94a3b8',
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
    <Suspense fallback={<div style={{ padding: 32, color: '#94a3b8' }}>Lade…</div>}>
      <ContentEinstellungenInner />
    </Suspense>
  );
}
