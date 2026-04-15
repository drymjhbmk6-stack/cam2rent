'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BuchhaltungTabs, { type TabId } from './components/BuchhaltungTabs';
import DashboardTab from './components/DashboardTab';
import RechnungenTab from './components/RechnungenTab';
import OffenePostenTab from './components/OffenePostenTab';
import GutschriftenTab from './components/GutschriftenTab';
import StripeAbgleichTab from './components/StripeAbgleichTab';
import ReportsTab from './components/ReportsTab';
import DatevExportTab from './components/DatevExportTab';
import EinstellungenTab from './components/EinstellungenTab';

const VALID_TABS: TabId[] = ['dashboard', 'rechnungen', 'offene-posten', 'gutschriften', 'stripe', 'reports', 'datev', 'einstellungen'];

function BuchhaltungContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'dashboard'
  );

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    router.push(`/admin/buchhaltung?tab=${tab}`, { scroll: false });
  }

  function handleNavigate(tab: string) {
    if (VALID_TABS.includes(tab as TabId)) {
      handleTabChange(tab as TabId);
    }
  }

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: 1280, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
          Buchhaltung
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6, marginBottom: 0 }}>
          Rechnungen, Mahnwesen, Stripe-Abgleich, EÜR und DATEV-Export
        </p>
      </div>

      {/* Tab-Navigation */}
      <BuchhaltungTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Tab-Inhalt */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab onNavigate={handleNavigate} />}
        {activeTab === 'rechnungen' && <RechnungenTab />}
        {activeTab === 'offene-posten' && <OffenePostenTab />}
        {activeTab === 'gutschriften' && <GutschriftenTab />}
        {activeTab === 'stripe' && <StripeAbgleichTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'datev' && <DatevExportTab />}
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
