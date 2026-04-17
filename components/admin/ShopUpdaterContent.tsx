'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

// ============================================================
// Types
// ============================================================

type NewsMessage = {
  id: string;
  text: string;
  active: boolean;
};

type HeroContent = {
  ueberschrift: string;
  untertitel: string;
  cta_text: string;
  cta_link: string;
};

type UspItem = {
  icon: string;
  text: string;
};

type UspsContent = {
  items: UspItem[];
};

type ReviewsContent = {
  show_reviews: boolean;
  count: number;
};

type NewsBannerContent = {
  enabled: boolean;
  messages: NewsMessage[];
};

type SectionData = {
  page: string;
  section: string;
  content: HeroContent | NewsBannerContent | UspsContent | ReviewsContent;
  is_active: boolean;
  sort_order: number;
};

// ============================================================
// Icon Options for USPs
// ============================================================

const ICON_OPTIONS = [
  { value: 'shield', label: 'Schutzschild' },
  { value: 'truck', label: 'Lieferung' },
  { value: 'clock', label: 'Uhr' },
  { value: 'star', label: 'Stern' },
  { value: 'check', label: 'Haken' },
  { value: 'heart', label: 'Herz' },
  { value: 'camera', label: 'Kamera' },
  { value: 'gift', label: 'Geschenk' },
  { value: 'zap', label: 'Blitz' },
  { value: 'thumbs-up', label: 'Daumen hoch' },
];

// ============================================================
// Reusable UI Components
// ============================================================

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        style={{ background: checked ? '#06b6d4' : '#334155' }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)' }}
        />
      </button>
      {label && <span className="text-sm" style={{ color: '#cbd5e1' }}>{label}</span>}
    </label>
  );
}

function SectionCard({
  title,
  description,
  isActive,
  onToggleActive,
  saving,
  onSave,
  children,
}: {
  title: string;
  description: string;
  isActive: boolean;
  onToggleActive: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
        <div>
          <h3 className="font-heading font-bold text-base" style={{ color: '#f1f5f9' }}>{title}</h3>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{description}</p>
        </div>
        <Toggle checked={isActive} onChange={onToggleActive} label={isActive ? 'Aktiv' : 'Inaktiv'} />
      </div>

      {/* Content */}
      <div className="px-6 py-5 space-y-4">
        {children}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 flex justify-end" style={{ borderTop: '1px solid #1e293b' }}>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-heading font-semibold transition-all disabled:opacity-50"
          style={{ background: '#06b6d4', color: '#0f172a' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#22d3ee'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#06b6d4'; }}
        >
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-heading font-semibold mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm font-body border focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
      />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder, rows = 3 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-heading font-semibold mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg text-sm font-body border focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y"
        style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
      />
    </div>
  );
}

// ============================================================
// Section Editors
// ============================================================

function HeroEditor({ content, onChange }: { content: HeroContent; onChange: (c: HeroContent) => void }) {
  return (
    <>
      <InputField
        label="Überschrift"
        value={content.ueberschrift}
        onChange={(v) => onChange({ ...content, ueberschrift: v })}
        placeholder="z.B. Action-Cams mieten statt kaufen"
      />
      <TextareaField
        label="Untertitel"
        value={content.untertitel}
        onChange={(v) => onChange({ ...content, untertitel: v })}
        placeholder="Beschreibungstext unter der Überschrift"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InputField
          label="CTA-Button Text"
          value={content.cta_text}
          onChange={(v) => onChange({ ...content, cta_text: v })}
          placeholder="z.B. Kameras entdecken"
        />
        <InputField
          label="CTA-Button Link"
          value={content.cta_link}
          onChange={(v) => onChange({ ...content, cta_link: v })}
          placeholder="z.B. /kameras"
        />
      </div>
    </>
  );
}

function NewsBannerEditor({ content, onChange }: { content: NewsBannerContent; onChange: (c: NewsBannerContent) => void }) {
  const addMessage = () => {
    const newId = String(Date.now());
    onChange({
      ...content,
      messages: [...content.messages, { id: newId, text: '', active: true }],
    });
  };

  const removeMessage = (id: string) => {
    onChange({
      ...content,
      messages: content.messages.filter((m) => m.id !== id),
    });
  };

  const updateMessage = (id: string, updates: Partial<NewsMessage>) => {
    onChange({
      ...content,
      messages: content.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    });
  };

  return (
    <>
      <Toggle
        checked={content.enabled}
        onChange={(v) => onChange({ ...content, enabled: v })}
        label="Banner anzeigen"
      />

      <div className="space-y-3 mt-2">
        {content.messages.map((msg, idx) => (
          <div key={msg.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#1e293b' }}>
            <span className="text-xs font-mono w-5 text-center flex-shrink-0" style={{ color: '#475569' }}>
              {idx + 1}
            </span>
            <input
              type="text"
              value={msg.text}
              onChange={(e) => updateMessage(msg.id, { text: e.target.value })}
              placeholder="Nachricht eingeben..."
              className="flex-1 px-3 py-1.5 rounded text-sm border focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#e2e8f0' }}
            />
            <Toggle
              checked={msg.active}
              onChange={(v) => updateMessage(msg.id, { active: v })}
            />
            <button
              onClick={() => removeMessage(msg.id)}
              className="p-1 rounded transition-colors flex-shrink-0"
              style={{ color: '#64748b' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
              title="Nachricht entfernen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addMessage}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors border"
        style={{ borderColor: '#334155', color: '#94a3b8' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4'; (e.currentTarget as HTMLElement).style.color = '#06b6d4'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nachricht hinzufügen
      </button>
    </>
  );
}

function UspsEditor({ content, onChange }: { content: UspsContent; onChange: (c: UspsContent) => void }) {
  const addItem = () => {
    onChange({
      ...content,
      items: [...content.items, { icon: 'check', text: '' }],
    });
  };

  const removeItem = (idx: number) => {
    onChange({
      ...content,
      items: content.items.filter((_, i) => i !== idx),
    });
  };

  const updateItem = (idx: number, updates: Partial<UspItem>) => {
    onChange({
      ...content,
      items: content.items.map((item, i) => (i === idx ? { ...item, ...updates } : item)),
    });
  };

  return (
    <>
      <div className="space-y-3">
        {content.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#1e293b' }}>
            <select
              value={item.icon}
              onChange={(e) => updateItem(idx, { icon: e.target.value })}
              className="px-2 py-1.5 rounded text-sm border focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#e2e8f0' }}
            >
              {ICON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateItem(idx, { text: e.target.value })}
              placeholder="Vorteil eingeben..."
              className="flex-1 px-3 py-1.5 rounded text-sm border focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#e2e8f0' }}
            />
            <button
              onClick={() => removeItem(idx)}
              className="p-1 rounded transition-colors flex-shrink-0"
              style={{ color: '#64748b' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
              title="Vorteil entfernen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors border"
        style={{ borderColor: '#334155', color: '#94a3b8' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4'; (e.currentTarget as HTMLElement).style.color = '#06b6d4'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Vorteil hinzufügen
      </button>
    </>
  );
}

function ReviewsEditor({ content, onChange }: { content: ReviewsContent; onChange: (c: ReviewsContent) => void }) {
  return (
    <>
      <Toggle
        checked={content.show_reviews}
        onChange={(v) => onChange({ ...content, show_reviews: v })}
        label="Bewertungen auf Startseite anzeigen"
      />
      <div>
        <label className="block text-xs font-heading font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
          Anzahl der Bewertungen
        </label>
        <input
          type="number"
          min={3}
          max={10}
          value={content.count}
          onChange={(e) => onChange({ ...content, count: Math.max(3, Math.min(10, Number(e.target.value) || 3)) })}
          className="w-32 px-3 py-2 rounded-lg text-sm font-body border focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
        />
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>Min. 3, Max. 10</p>
      </div>
    </>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function ShopUpdaterContent() {
  const [selectedPage, setSelectedPage] = useState('startseite');
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop-content?page=${selectedPage}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        // Alle erwarteten Sections garantieren — auch wenn DB leer/partial ist.
        // Ohne diesen Schritt schlägt updateSectionLocal (map) fehl und Eingaben
        // verpuffen, weil die Section im State nicht existiert.
        const expected: Array<{ section: string; content: HeroContent | NewsBannerContent | UspsContent | ReviewsContent; sort_order: number }> = [
          { section: 'hero', content: { ueberschrift: '', untertitel: '', cta_text: '', cta_link: '' }, sort_order: 0 },
          { section: 'news_banner', content: { enabled: true, messages: [] }, sort_order: 1 },
          { section: 'usps', content: { items: [] }, sort_order: 2 },
          { section: 'reviews_config', content: { show_reviews: true, count: 6 }, sort_order: 3 },
        ];
        const normalized: SectionData[] = expected.map((exp) => {
          const existing = data.find((s) => s.section === exp.section);
          if (existing) {
            return {
              page: existing.page ?? selectedPage,
              section: exp.section,
              content: { ...(exp.content as object), ...((existing.content as object) ?? {}) } as SectionData['content'],
              is_active: typeof existing.is_active === 'boolean' ? existing.is_active : true,
              sort_order: typeof existing.sort_order === 'number' ? existing.sort_order : exp.sort_order,
            };
          }
          return {
            page: selectedPage,
            section: exp.section,
            content: exp.content,
            is_active: true,
            sort_order: exp.sort_order,
          };
        });
        setSections(normalized);
      }
    } catch {
      showToast('Fehler beim Laden der Inhalte', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedPage, showToast]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const getSection = (sectionName: string): SectionData | undefined => {
    return sections.find((s) => s.section === sectionName);
  };

  const updateSectionLocal = (sectionName: string, updates: Partial<SectionData>) => {
    setSections((prev) =>
      prev.map((s) => (s.section === sectionName ? { ...s, ...updates } : s))
    );
  };

  const saveSection = async (sectionName: string) => {
    const section = getSection(sectionName);
    if (!section) return;

    setSavingSection(sectionName);
    try {
      const res = await fetch('/api/shop-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: selectedPage,
          section: sectionName,
          content: section.content,
          is_active: section.is_active,
        }),
      });

      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      showToast(`"${sectionName}" erfolgreich gespeichert`, 'success');
    } catch {
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  const heroData = (getSection('hero')?.content as HeroContent) ?? {
    ueberschrift: '', untertitel: '', cta_text: '', cta_link: '',
  };
  const newsData = (getSection('news_banner')?.content as NewsBannerContent) ?? {
    enabled: true, messages: [],
  };
  const uspsData = (getSection('usps')?.content as UspsContent) ?? { items: [] };
  const reviewsData = (getSection('reviews_config')?.content as ReviewsContent) ?? {
    show_reviews: true, count: 6,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <AdminBackLink label="Zurück" />
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-heading font-semibold shadow-lg animate-in"
          style={{
            background: toast.type === 'success' ? '#065f46' : '#7f1d1d',
            color: 'white',
            border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: '#f1f5f9' }}>
          Shop Updater
        </h1>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Inhalte der Shop-Seiten bearbeiten und veröffentlichen
        </p>
      </div>

      {/* Page Selector */}
      <div className="mb-6">
        <label className="block text-xs font-heading font-semibold mb-2" style={{ color: '#94a3b8' }}>
          Seite auswählen
        </label>
        <div className="flex gap-2">
          {['startseite'].map((page) => (
            <button
              key={page}
              onClick={() => setSelectedPage(page)}
              className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
              style={
                selectedPage === page
                  ? { background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }
                  : { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }
              }
            >
              {page.charAt(0).toUpperCase() + page.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero Section */}
          <SectionCard
            title="Hero-Bereich"
            description="Hauptbanner oben auf der Startseite"
            isActive={getSection('hero')?.is_active ?? true}
            onToggleActive={(v) => updateSectionLocal('hero', { is_active: v })}
            saving={savingSection === 'hero'}
            onSave={() => saveSection('hero')}
          >
            <HeroEditor
              content={heroData}
              onChange={(c) => updateSectionLocal('hero', { content: c })}
            />
          </SectionCard>

          {/* News Banner */}
          <SectionCard
            title="News-Banner"
            description="Laufband mit Neuigkeiten unter der Navigation"
            isActive={getSection('news_banner')?.is_active ?? true}
            onToggleActive={(v) => updateSectionLocal('news_banner', { is_active: v })}
            saving={savingSection === 'news_banner'}
            onSave={() => saveSection('news_banner')}
          >
            <NewsBannerEditor
              content={newsData}
              onChange={(c) => updateSectionLocal('news_banner', { content: c })}
            />
          </SectionCard>

          {/* USPs */}
          <SectionCard
            title="Vorteile / USPs"
            description="Vorteile die auf der Startseite angezeigt werden"
            isActive={getSection('usps')?.is_active ?? true}
            onToggleActive={(v) => updateSectionLocal('usps', { is_active: v })}
            saving={savingSection === 'usps'}
            onSave={() => saveSection('usps')}
          >
            <UspsEditor
              content={uspsData}
              onChange={(c) => updateSectionLocal('usps', { content: c })}
            />
          </SectionCard>

          {/* Reviews Config */}
          <SectionCard
            title="Bewertungen"
            description="Einstellungen für die Bewertungsanzeige"
            isActive={getSection('reviews_config')?.is_active ?? true}
            onToggleActive={(v) => updateSectionLocal('reviews_config', { is_active: v })}
            saving={savingSection === 'reviews_config'}
            onSave={() => saveSection('reviews_config')}
          >
            <ReviewsEditor
              content={reviewsData}
              onChange={(c) => updateSectionLocal('reviews_config', { content: c })}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
