'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RechnungenTab from './RechnungenTab';
import OffenePostenTab from './OffenePostenTab';
import GutschriftenTab from './GutschriftenTab';

type SubTab = 'rechnungen' | 'offen' | 'gutschriften';

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: 'rechnungen', label: 'Alle Rechnungen', description: 'Komplette Rechnungs-Liste mit Filter' },
  { id: 'offen', label: 'Offene Posten', description: 'Unbezahlt + Mahnwesen' },
  { id: 'gutschriften', label: 'Gutschriften', description: 'Storno + Erstattungen' },
];

export default function EinnahmenTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = searchParams.get('sub') as SubTab | null;
  const [active, setActive] = useState<SubTab>(
    subParam && SUB_TABS.some((s) => s.id === subParam) ? subParam : 'rechnungen'
  );

  useEffect(() => {
    if (subParam && SUB_TABS.some((s) => s.id === subParam) && subParam !== active) {
      setActive(subParam);
    }
  }, [subParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubChange(sub: SubTab) {
    setActive(sub);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'einnahmen');
    params.set('sub', sub);
    router.push(`/admin/buchhaltung?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Sub-Tab-Navigation als Pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {SUB_TABS.map((sub) => {
          const isActive = sub.id === active;
          return (
            <button
              key={sub.id}
              onClick={() => handleSubChange(sub.id)}
              title={sub.description}
              style={{
                background: isActive ? '#06b6d4' : '#111827',
                color: isActive ? '#0f172a' : '#94a3b8',
                border: `1px solid ${isActive ? '#06b6d4' : '#1e293b'}`,
                borderRadius: 999,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#94a3b8'; }}
            >
              {sub.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab-Inhalt */}
      {active === 'rechnungen' && <RechnungenTab />}
      {active === 'offen' && <OffenePostenTab />}
      {active === 'gutschriften' && <GutschriftenTab />}
    </div>
  );
}
