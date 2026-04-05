'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type WidgetLayoutItem,
  type WidgetSize,
  WIDGET_REGISTRY,
  DEFAULT_LAYOUT,
  getWidgetDef,
  loadLayout,
  saveLayout,
} from '@/lib/admin-widgets';
import {
  WidgetRenderer,
  WidgetEditOverlay,
  WidgetAddPanel,
} from '@/components/admin/DashboardWidgets';

// ─── Theme ───────────────────────────────────────────────────────

const C = {
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanDim: 'rgba(6,182,212,0.15)',
  green: '#10b981',
  red: '#ef4444',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
} as const;

// ─── Size → grid column span ────────────────────────────────────

function nextSize(current: WidgetSize): WidgetSize {
  switch (current) {
    case 'small': return 'medium';
    case 'medium': return 'large';
    case 'large': return 'small';
  }
}

// ─── Dashboard Page ──────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [layout, setLayout] = useState<WidgetLayoutItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editLayout, setEditLayout] = useState<WidgetLayoutItem[]>([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load layout from localStorage on mount
  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard-data');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  // ── Edit mode handlers ─────────────────────────────────────────

  function enterEditMode() {
    setEditLayout(JSON.parse(JSON.stringify(layout)));
    setEditMode(true);
    setShowAddPanel(false);
  }

  function cancelEdit() {
    setEditMode(false);
    setShowAddPanel(false);
  }

  function saveEdit() {
    setLayout(editLayout);
    saveLayout(editLayout);
    setEditMode(false);
    setShowAddPanel(false);
  }

  function resetToDefault() {
    setEditLayout(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
  }

  function toggleSize(idx: number) {
    const newLayout = [...editLayout];
    newLayout[idx] = { ...newLayout[idx], size: nextSize(newLayout[idx].size) };
    setEditLayout(newLayout);
  }

  function removeWidget(idx: number) {
    const newLayout = [...editLayout];
    newLayout[idx] = { ...newLayout[idx], visible: false };
    setEditLayout(newLayout);
  }

  function addWidget(widgetId: string) {
    const def = getWidgetDef(widgetId);
    if (!def) return;
    // Check if it exists but is hidden
    const existing = editLayout.findIndex((w) => w.widgetId === widgetId);
    if (existing >= 0) {
      const newLayout = [...editLayout];
      newLayout[existing] = { ...newLayout[existing], visible: true };
      setEditLayout(newLayout);
    } else {
      setEditLayout([...editLayout, { widgetId, size: def.defaultSize, visible: true }]);
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  const activeLayout = editMode ? editLayout : layout;
  const visibleWidgets = activeLayout.filter((w) => w.visible);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4, margin: 0 }}>
            cam<span style={{ color: C.cyan }}>2</span>rent Admin
          </h1>
          <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {!editMode ? (
          <button
            onClick={enterEditMode}
            style={{
              background: C.cyanDim,
              border: `1px solid ${C.cyan}40`,
              borderRadius: 8,
              color: C.cyan,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.cyan}30`; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.cyanDim; }}
          >
            Dashboard anpassen
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              style={{
                background: C.cyanDim,
                border: `1px solid ${C.cyan}40`,
                borderRadius: 8,
                color: C.cyan,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Widget hinzufügen
            </button>
            <button
              onClick={resetToDefault}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.textMuted,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Standard wiederherstellen
            </button>
            <button
              onClick={cancelEdit}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.textMuted,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={saveEdit}
              style={{
                background: C.cyan,
                border: 'none',
                borderRadius: 8,
                color: '#0f172a',
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Layout speichern
            </button>
          </div>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div style={{
          background: C.cyanDim,
          border: `1px solid ${C.cyan}30`,
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: C.cyan,
          fontWeight: 500,
        }}>
          Bearbeitungsmodus: Verschiebe Widgets mit den Pfeilen, ändere die Größe (S/M/L) oder entferne sie.
        </div>
      )}

      {/* Widget Grid */}
      <div className="c2r-dash-grid">
        {visibleWidgets.map((w, visIdx) => {
          const def = getWidgetDef(w.widgetId);
          if (!def) return null;

          // Find real index in editLayout for edit operations
          const realIdx = editMode
            ? editLayout.findIndex((el) => el.widgetId === w.widgetId)
            : -1;

          const spanClass = w.size === 'large' ? 'c2r-span-4' : w.size === 'medium' ? 'c2r-span-2' : '';

          return (
            <div
              key={w.widgetId}
              className={spanClass}
              style={{
                position: 'relative',
                minHeight: w.size === 'small' ? 140 : 200,
              }}
            >
              <WidgetRenderer
                widgetId={w.widgetId}
                data={data as Record<string, unknown> | null}
                loading={loading}
              />

              {editMode && (
                <WidgetEditOverlay
                  index={visIdx}
                  total={visibleWidgets.length}
                  size={w.size}
                  onMoveUp={() => {
                    if (realIdx < 0) return;
                    let prevIdx = -1;
                    for (let i = realIdx - 1; i >= 0; i--) {
                      if (editLayout[i].visible) { prevIdx = i; break; }
                    }
                    if (prevIdx >= 0) {
                      const nl = [...editLayout];
                      [nl[realIdx], nl[prevIdx]] = [nl[prevIdx], nl[realIdx]];
                      setEditLayout(nl);
                    }
                  }}
                  onMoveDown={() => {
                    if (realIdx < 0) return;
                    let nxtIdx = -1;
                    for (let i = realIdx + 1; i < editLayout.length; i++) {
                      if (editLayout[i].visible) { nxtIdx = i; break; }
                    }
                    if (nxtIdx >= 0) {
                      const nl = [...editLayout];
                      [nl[realIdx], nl[nxtIdx]] = [nl[nxtIdx], nl[realIdx]];
                      setEditLayout(nl);
                    }
                  }}
                  onToggleSize={() => {
                    if (realIdx >= 0) toggleSize(realIdx);
                  }}
                  onRemove={() => {
                    if (realIdx >= 0) removeWidget(realIdx);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {visibleWidgets.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 60, color: C.textDim, fontSize: 14,
        }}>
          Keine Widgets sichtbar.{' '}
          {editMode ? (
            <button
              onClick={() => setShowAddPanel(true)}
              style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Widget hinzufügen
            </button>
          ) : (
            <button
              onClick={enterEditMode}
              style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Dashboard anpassen
            </button>
          )}
        </div>
      )}

      {/* Add Widget Panel */}
      {editMode && showAddPanel && (
        <WidgetAddPanel
          onAdd={addWidget}
          existingIds={new Set(editLayout.filter((w) => w.visible).map((w) => w.widgetId))}
          onClose={() => setShowAddPanel(false)}
          registry={WIDGET_REGISTRY}
        />
      )}

      {/* Responsive grid styles */}
      <style>{`
        .c2r-dash-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .c2r-span-2 { grid-column: span 2; }
        .c2r-span-4 { grid-column: span 4; }
        @media (max-width: 1024px) {
          .c2r-dash-grid { grid-template-columns: repeat(2, 1fr); }
          .c2r-span-4 { grid-column: span 2; }
        }
        @media (max-width: 640px) {
          .c2r-dash-grid { grid-template-columns: 1fr; }
          .c2r-span-2 { grid-column: span 1; }
          .c2r-span-4 { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
