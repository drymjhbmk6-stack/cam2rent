// ─── Widget System for Admin Dashboard ───────────────────────────

export type WidgetSize = 'small' | 'medium' | 'large';
export type WidgetCategory = 'metric' | 'list' | 'chart' | 'action';

export interface WidgetDefinition {
  id: string;
  label: string;
  category: WidgetCategory;
  defaultSize: WidgetSize;
  description: string;
}

export interface WidgetLayoutItem {
  widgetId: string;
  size: WidgetSize;
  visible: boolean;
}

// ─── Widget Registry ─────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ── Metrics (small) ──
  { id: 'daily_bookings',     label: 'Heutige Buchungen',           category: 'metric', defaultSize: 'small', description: 'Anzahl der Buchungen von heute' },
  { id: 'pending_shipments',  label: 'Offene Versandaufträge',      category: 'metric', defaultSize: 'small', description: 'Buchungen die noch versendet werden müssen' },
  { id: 'upcoming_returns',   label: 'Anstehende Rückgaben (3 Tage)', category: 'metric', defaultSize: 'small', description: 'Rückgaben in den nächsten 3 Tagen' },
  { id: 'unread_messages',    label: 'Ungelesene Nachrichten',      category: 'metric', defaultSize: 'small', description: 'Anzahl ungelesener Kundennachrichten' },
  { id: 'open_damages',       label: 'Offene Schadensfälle',        category: 'metric', defaultSize: 'small', description: 'Offene Schadensmeldungen' },
  { id: 'revenue_today',      label: 'Umsatz heute',                category: 'metric', defaultSize: 'small', description: 'Gesamtumsatz der heutigen Buchungen' },
  { id: 'revenue_week',       label: 'Umsatz diese Woche',          category: 'metric', defaultSize: 'small', description: 'Gesamtumsatz der aktuellen Woche' },
  { id: 'revenue_month',      label: 'Umsatz dieser Monat',         category: 'metric', defaultSize: 'small', description: 'Gesamtumsatz des aktuellen Monats' },
  { id: 'active_bookings',    label: 'Aktive Buchungen',            category: 'metric', defaultSize: 'small', description: 'Buchungen im Status confirmed oder shipped' },
  { id: 'total_customers',    label: 'Kunden gesamt',               category: 'metric', defaultSize: 'small', description: 'Gesamtanzahl registrierter Kunden' },
  { id: 'new_customers_week', label: 'Neukunden diese Woche',       category: 'metric', defaultSize: 'small', description: 'Neue Kunden in dieser Woche' },

  // ── Lists (medium) ──
  { id: 'activity_feed',          label: 'Aktivitäts-Feed',         category: 'list', defaultSize: 'medium', description: 'Die letzten 20 Aktivitäten' },
  { id: 'recent_bookings',        label: 'Letzte Buchungen',        category: 'list', defaultSize: 'medium', description: 'Die 10 neuesten Buchungen' },
  { id: 'upcoming_returns_list',  label: 'Anstehende Rückgaben',    category: 'list', defaultSize: 'medium', description: 'Rückgaben der nächsten Tage im Detail' },
  { id: 'open_damages_list',      label: 'Offene Schadensfälle',    category: 'list', defaultSize: 'medium', description: 'Aktuelle offene Schadensmeldungen' },
  { id: 'unread_messages_list',   label: 'Ungelesene Nachrichten',  category: 'list', defaultSize: 'medium', description: 'Neueste ungelesene Nachrichten' },
  { id: 'recent_reviews',         label: 'Letzte Bewertungen',      category: 'list', defaultSize: 'medium', description: 'Neueste Kundenbewertungen' },

  { id: 'camera_utilization', label: 'Kamera-Auslastung', category: 'list' as const, defaultSize: 'medium' as const, description: 'Auslastungsrate aller Kameras' },

  // ── Actions (large) ──
  { id: 'quick_actions', label: 'Schnellaktionen', category: 'action', defaultSize: 'large', description: 'Schnellzugriff auf häufig genutzte Admin-Bereiche' },
];

// ─── Default Layout ──────────────────────────────────────────────

export const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
  // Row 1: Key metrics
  { widgetId: 'daily_bookings',    size: 'small', visible: true },
  { widgetId: 'pending_shipments', size: 'small', visible: true },
  { widgetId: 'upcoming_returns',  size: 'small', visible: true },
  { widgetId: 'unread_messages',   size: 'small', visible: true },

  // Row 2: Revenue + damage
  { widgetId: 'revenue_today',     size: 'small', visible: true },
  { widgetId: 'revenue_week',      size: 'small', visible: true },
  { widgetId: 'revenue_month',     size: 'small', visible: true },
  { widgetId: 'open_damages',      size: 'small', visible: true },

  // Row 3: More metrics
  { widgetId: 'active_bookings',    size: 'small', visible: true },
  { widgetId: 'total_customers',    size: 'small', visible: true },
  { widgetId: 'new_customers_week', size: 'small', visible: true },

  // Lists
  { widgetId: 'recent_bookings',       size: 'medium', visible: true },
  { widgetId: 'upcoming_returns_list', size: 'medium', visible: true },
  { widgetId: 'activity_feed',         size: 'medium', visible: true },
  { widgetId: 'unread_messages_list',  size: 'medium', visible: true },
  { widgetId: 'open_damages_list',     size: 'medium', visible: false },
  { widgetId: 'recent_reviews',        size: 'medium', visible: false },

  // Quick actions
  { widgetId: 'quick_actions', size: 'large', visible: true },
];

// ─── Helpers ─────────────────────────────────────────────────────

export function getWidgetDef(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}

export const LAYOUT_STORAGE_KEY = 'cam2rent_admin_dashboard_layout';

export function loadLayout(): WidgetLayoutItem[] {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as WidgetLayoutItem[];
      // Validate: ensure all registry widgets are present
      const existingIds = new Set(parsed.map((w) => w.widgetId));
      const missing = WIDGET_REGISTRY.filter((w) => !existingIds.has(w.id));
      if (missing.length > 0) {
        // Add missing widgets as hidden
        for (const m of missing) {
          parsed.push({ widgetId: m.id, size: m.defaultSize, visible: false });
        }
      }
      // Remove widgets no longer in registry
      return parsed.filter((w) => WIDGET_REGISTRY.some((r) => r.id === w.widgetId));
    }
  } catch {
    // ignore
  }
  return DEFAULT_LAYOUT;
}

export function saveLayout(layout: WidgetLayoutItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}
