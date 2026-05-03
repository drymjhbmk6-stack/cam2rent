'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BuchhaltungTabs, { type TabId } from './components/BuchhaltungTabs';
import DashboardTab from './components/DashboardTab';
import EinnahmenTab from './components/EinnahmenTab';
import AusgabenIntegratedTab from './components/AusgabenIntegratedTab';
import StripeAbgleichTab from './components/StripeAbgleichTab';
import ReportsCombinedTab from './components/ReportsCombinedTab';
import EinstellungenTab from './components/EinstellungenTab';

const VALID_TABS: TabId[] = ['dashboard', 'einnahmen', 'ausgaben', 'stripe', 'reports', 'einstellungen'];

/**
 * Backwards-Compat: alte URL-Parameter (vor Etappe 2) auf neue Tabs mappen.
 * Bookmarks und gespeicherte Notification-Links bleiben damit funktional.
 */
function legacyTabRedirect(legacyTab: string): { tab: TabId; sub?: string } | null {
  switch (legacyTab) {
    case 'rechnungen':
      return { tab: 'einnahmen', sub: 'rechnungen' };
    case 'offene-posten':
      return { tab: 'einnahmen', sub: 'offen' };
    case 'gutschriften':
      return { tab: 'einnahmen', sub: 'gutschriften' };
    case 'datev':
      return { tab: 'reports', sub: 'datev' };
    default:
      return null;
  }
}

function BuchhaltungContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');

  // Initialer Tab: berücksichtigt Legacy-URLs
  const initialTab: TabId = (() => {
    if (!tabParam) return 'dashboard';
    if (VALID_TABS.includes(tabParam as TabId)) return tabParam as TabId;
    const legacy = legacyTabRedirect(tabParam);
    return legacy ? legacy.tab : 'dashboard';
  })();

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Wenn die URL einen Legacy-Tab enthaelt, einmalig auf neue URL umleiten
  useEffect(() => {
    if (tabParam && !VALID_TABS.includes(tabParam as TabId)) {
      const legacy = legacyTabRedirect(tabParam);
      if (legacy) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', legacy.tab);
        if (legacy.sub) params.set('sub', legacy.sub);
        router.replace(`/admin/buchhaltung?${params.toString()}`, { scroll: false });
        setActiveTab(legacy.tab);
      }
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam as TabId) && tabParam !== activeTab) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    // Beim Tab-Wechsel die `sub`-Param entfernen (gehoert zum alten Tab)
    router.push(`/admin/buchhaltung?tab=${tab}`, { scroll: false });
  }

  function handleNavigate(tab: string) {
    if (VALID_TABS.includes(tab as TabId)) {
      handleTabChange(tab as TabId);
      return;
    }
    // Cockpit-Inbox-Aktionen verwenden noch alte Tab-Namen → mappen
    const legacy = legacyTabRedirect(tab);
    if (legacy) {
      setActiveTab(legacy.tab);
      const params = new URLSearchParams();
      params.set('tab', legacy.tab);
      if (legacy.sub) params.set('sub', legacy.sub);
      router.push(`/admin/buchhaltung?${params.toString()}`, { scroll: false });
    }
  }

  return (
    <div className="cam2-buchhaltung-page" style={{ padding: '24px 24px 48px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 640px) {
          .cam2-buchhaltung-page { padding: 16px 12px 32px !important; }
          .cam2-buchhaltung-page h1 { font-size: 20px !important; }
          .cam2-buchhaltung-page table { font-size: 12px !important; }
          .cam2-buchhaltung-page table th,
          .cam2-buchhaltung-page table td { padding: 8px 6px !important; }
          /* iOS Auto-Zoom verhindern */
          .cam2-buchhaltung-page input,
          .cam2-buchhaltung-page select,
          .cam2-buchhaltung-page textarea { font-size: 16px !important; }
        }
      `}</style>
      <AdminBackLink label="Zurück" />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
          Buchhaltung
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6, marginBottom: 0 }}>
          Cockpit, Einnahmen, Ausgaben, Stripe-Abgleich, Berichte und Einstellungen
        </p>
      </div>

      {/* Tab-Navigation */}
      <BuchhaltungTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Tab-Inhalt */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab onNavigate={handleNavigate} />}
        {activeTab === 'einnahmen' && <EinnahmenTab />}
        {activeTab === 'ausgaben' && <AusgabenIntegratedTab />}
        {activeTab === 'stripe' && <StripeAbgleichTab />}
        {activeTab === 'reports' && <ReportsCombinedTab />}
        {activeTab === 'einstellungen' && <EinstellungenTab />}
      </div>
    </div>
  );
}

export default function BuchhaltungPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ height: 32, width: 200, background: '#1e293b', borderRadius: 8, marginBottom: 24 }} />
        <div style={{ height: 40, background: '#1e293b', borderRadius: 8, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 100, background: '#1e293b', borderRadius: 8 }} />)}
        </div>
      </div>
    }>
      <BuchhaltungContent />
    </Suspense>
  );
}
