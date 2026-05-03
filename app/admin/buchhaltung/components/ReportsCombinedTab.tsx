'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReportsTab from './ReportsTab';
import DatevExportTab from './DatevExportTab';

type SubTab = 'analyse' | 'datev';

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: 'analyse', label: 'EÜR & USt-VA', description: 'Einnahmen-Ueberschuss + Voranmeldung' },
  { id: 'datev', label: 'DATEV-Export', description: 'CSV fuer Steuerberater' },
];

export default function ReportsCombinedTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = searchParams.get('sub') as SubTab | null;
  const [active, setActive] = useState<SubTab>(
    subParam && SUB_TABS.some((s) => s.id === subParam) ? subParam : 'analyse'
  );

  useEffect(() => {
    if (subParam && SUB_TABS.some((s) => s.id === subParam) && subParam !== active) {
      setActive(subParam);
    }
  }, [subParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubChange(sub: SubTab) {
    setActive(sub);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'reports');
    params.set('sub', sub);
    router.push(`/admin/buchhaltung?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
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

      {active === 'analyse' && <ReportsTab />}
      {active === 'datev' && <DatevExportTab />}
    </div>
  );
}
