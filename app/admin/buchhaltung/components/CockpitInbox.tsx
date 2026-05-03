'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Severity = 'info' | 'warning' | 'critical' | 'ok';

interface Todo {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  subtitle?: string;
  count?: number;
  amount?: number;
  action?: { label: string; tab?: string; href?: string };
}

interface Props {
  onNavigateTab?: (tab: string) => void;
}

const SEVERITY_STYLES: Record<Severity, { border: string; bg: string; iconColor: string; iconBg: string }> = {
  critical: {
    border: 'rgba(239,68,68,0.35)',
    bg: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
    iconColor: '#fca5a5',
    iconBg: 'rgba(239,68,68,0.18)',
  },
  warning: {
    border: 'rgba(245,158,11,0.35)',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
    iconColor: '#fbbf24',
    iconBg: 'rgba(245,158,11,0.18)',
  },
  info: {
    border: 'rgba(6,182,212,0.35)',
    bg: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(6,182,212,0.03))',
    iconColor: '#67e8f9',
    iconBg: 'rgba(6,182,212,0.18)',
  },
  ok: {
    border: 'rgba(16,185,129,0.35)',
    bg: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(16,185,129,0.03))',
    iconColor: '#6ee7b7',
    iconBg: 'rgba(16,185,129,0.18)',
  },
};

function IconSvg({ name, color }: { name: string; color: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'alert':
      return <svg {...common}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'link':
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case 'inbox':
      return <svg {...common}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'mail':
      return <svg {...common}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case 'check':
      return <svg {...common}><polyline points="20 6 9 17 4 12"/></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

export default function CockpitInbox({ onNavigateTab }: Props) {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/buchhaltung/cockpit', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setTodos(json.todos || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleAction(action: NonNullable<Todo['action']>) {
    if (action.href) {
      router.push(action.href);
    } else if (action.tab && onNavigateTab) {
      onNavigateTab(action.tab);
    } else if (action.tab) {
      router.push(`/admin/buchhaltung?tab=${action.tab}`);
    }
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ height: 24, width: 200, background: '#1e293b', borderRadius: 6, marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 96, background: '#111827', border: '1px solid #1e293b', borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#111827', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>Cockpit konnte nicht geladen werden: {error}</div>
      </div>
    );
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          Heute zu tun
        </h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {todos.length === 1 && todos[0].id === 'all_clear' ? '0 offene Aufgaben' : `${todos.length} ${todos.length === 1 ? 'Aufgabe' : 'Aufgaben'}`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {todos.map((todo) => {
          const style = SEVERITY_STYLES[todo.severity];
          return (
            <div
              key={todo.id}
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: style.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconSvg name={todo.icon} color={style.iconColor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 2, lineHeight: 1.35 }}>
                  {todo.title}
                </div>
                {todo.subtitle && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: todo.action ? 10 : 0 }}>
                    {todo.subtitle}
                  </div>
                )}
                {todo.action && (
                  <button
                    onClick={() => handleAction(todo.action!)}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${style.border}`,
                      color: style.iconColor,
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    {todo.action.label} →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
