'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Bell, Store, LogOut, Menu, X, ScanLine } from 'lucide-react';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import {
  NAV, DASHBOARD_ITEM, BOTTOM_TABS, isLeaf,
  type NavNode, type NavLeaf, type NavGroup,
} from './nav-config';

/* ═══════════════════════════════════════════════════════════════════════════
   cam2rent Admin 2.0 — App-Shell (hell)
   Navy Sidebar (ruhiger Anker) + helle, werkzeughafte Arbeitsfläche.
   Design-Prototyp: statische Navigation, keine Permission-/API-Abfragen.
   ═══════════════════════════════════════════════════════════════════════════ */

function stripQuery(href: string) {
  const i = href.indexOf('?');
  return i === -1 ? href : href.slice(0, i);
}

function leafActive(leaf: NavLeaf, pathname: string) {
  const path = stripQuery(leaf.href);
  if (leaf.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function nodeContainsActive(node: NavNode, pathname: string): boolean {
  if (isLeaf(node)) return leafActive(node, pathname);
  return node.children.some((c) => nodeContainsActive(c, pathname));
}

/* ── Rekursiver Nav-Baum ── */
function NavTree({
  nodes,
  pathname,
  depth,
  open,
  toggle,
  onNavClick,
}: {
  nodes: NavNode[];
  pathname: string;
  depth: number;
  open: Set<string>;
  toggle: (label: string) => void;
  onNavClick: () => void;
}) {
  return (
    <div className={depth > 0 ? 'ml-3 pl-2 border-l border-white/5' : ''}>
      {nodes.map((node) => {
        if (isLeaf(node)) {
          const on = leafActive(node, pathname);
          const Icon = node.icon;
          return (
            <Link
              key={node.label + node.href}
              href={node.href}
              onClick={onNavClick}
              className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                on ? 'bg-cyan-500/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
              style={{ textDecoration: 'none' }}
            >
              {Icon && <Icon size={15} className={on ? 'text-cyan-400 shrink-0' : 'text-slate-500 group-hover:text-slate-300 shrink-0'} />}
              <span className="flex-1 truncate text-[13px]">{node.label}</span>
              {node.badge ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500 text-white">{node.badge}</span>
              ) : null}
            </Link>
          );
        }
        const isOpen = open.has(node.label);
        const Icon = node.icon;
        const activeInside = nodeContainsActive(node, pathname);
        return (
          <div key={node.label}>
            <button
              onClick={() => toggle(node.label)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                activeInside ? 'text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {Icon && <Icon size={15} className={activeInside ? 'text-cyan-400 shrink-0' : 'text-slate-500 shrink-0'} />}
              <span className="flex-1 truncate text-[13px]">{node.label}</span>
              {isOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </button>
            {isOpen && (
              <NavTree
                nodes={node.children}
                pathname={pathname}
                depth={depth + 1}
                open={open}
                toggle={toggle}
                onNavClick={onNavClick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const OPEN_KEY = 'admin2_nav_open';

function collectAncestorsOfActive(nodes: NavNode[], pathname: string, acc: string[] = []): string[] {
  for (const n of nodes) {
    if (!isLeaf(n) && nodeContainsActive(n, pathname)) {
      acc.push(n.label);
      collectAncestorsOfActive(n.children, pathname, acc);
    }
  }
  return acc;
}

function Sidebar({ pathname, onNavClick, onLogout }: { pathname: string; onNavClick: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Beim ersten Render + bei Pfadwechsel: Vorfahren des aktiven Punkts aufklappen.
  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(OPEN_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {}
    const ancestors = collectAncestorsOfActive(NAV.flatMap((g) => g.items), pathname);
    setOpen(new Set([...stored, ...ancestors]));
  }, [pathname]);

  const toggle = (label: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const dashActive = pathname === '/admin';

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 h-14 flex items-center gap-2 border-b border-white/10 shrink-0">
        <img src="/logo/mark.svg" alt="" aria-hidden width={30} height={20} style={{ height: 20, width: 'auto' }} />
        <span className="font-bold text-[15px] tracking-tight text-white">
          cam<span className="text-cyan-400">2</span>rent
        </span>
        <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 tracking-wide">2.0</span>
      </div>

      {/* Nav */}
      <nav className="p-2 flex-1 overflow-y-auto">
        <Link
          href={DASHBOARD_ITEM.href}
          onClick={onNavClick}
          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md mb-1 transition-colors ${
            dashActive ? 'bg-cyan-500/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
          style={{ textDecoration: 'none' }}
        >
          {DASHBOARD_ITEM.icon && (
            <DASHBOARD_ITEM.icon size={15} className={dashActive ? 'text-cyan-400' : 'text-slate-500'} />
          )}
          <span className="flex-1 text-[13px]">{DASHBOARD_ITEM.label}</span>
        </Link>

        {NAV.map((group: NavGroup) => (
          <div key={group.title} className="mb-1">
            <div className="px-2.5 pt-3 pb-1 text-[9px] uppercase tracking-[0.15em] text-slate-600 font-semibold">
              {group.title}
            </div>
            <NavTree nodes={group.items} pathname={pathname} depth={0} open={open} toggle={toggle} onNavClick={onNavClick} />
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 shrink-0">
        <div className="px-3 py-2 text-[11px] text-slate-500 font-mono flex flex-col gap-0.5">
          <div className="flex justify-between"><span>Auslastung 7d</span><span className="text-cyan-400">71%</span></div>
          <div className="flex justify-between"><span>Draußen</span><span className="text-slate-300">3/5</span></div>
        </div>
        <div className="px-2 pb-3 flex flex-col gap-0.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white text-[13px]"
            style={{ textDecoration: 'none' }}
          >
            <Store size={15} className="text-slate-500" /> Zum Shop
          </Link>
          <button
            onClick={onLogout}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white text-[13px]"
          >
            <LogOut size={15} className="text-slate-500" /> Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

function berlinDate() {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
    }).format(new Date());
  } catch {
    return '';
  }
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [today, setToday] = useState('');

  useEffect(() => { setToday(berlinDate()); }, []);

  const onLogout = () => router.push('/admin/login');

  // Druck-/QR-/Scan-/Blog-/Login-Seiten: eigenes Layout, kein Shell.
  const isStandalone =
    pathname === '/admin/login'
    || pathname.startsWith('/admin/blog')
    || pathname.endsWith('/qr-codes')
    || pathname.startsWith('/admin/scan');

  const bottomActive = useMemo(
    () => (href: string) => {
      const p = stripQuery(href);
      return pathname === p || pathname.startsWith(`${p}/`);
    },
    [pathname],
  );

  if (isStandalone) return <>{children}</>;

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <NotificationsProvider>
      <div className="min-h-screen flex bg-slate-100 text-slate-900 text-[13px] antialiased">
        {/* Mobile header */}
        <div
          className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-3 bg-[#0f172a] border-b border-white/10"
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
        >
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-cyan-400" aria-label="Menü öffnen">
            <Menu size={22} />
          </button>
          <Link href="/admin" className="ml-2 flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <img src="/logo/mark.svg" alt="" aria-hidden width={28} height={20} style={{ height: 20, width: 'auto' }} />
            <span className="font-bold text-[15px] text-white">cam<span className="text-cyan-400">2</span>rent</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">2.0</span>
          </Link>
          <button className="ml-auto p-2 text-cyan-400" aria-label="Benachrichtigungen"><Bell size={20} /></button>
        </div>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={closeSidebar} aria-hidden />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col bg-[#0f172a] border-r border-white/10 transform transition-transform duration-300 lg:relative lg:translate-x-0 lg:shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="lg:hidden absolute top-3 right-3 z-10">
            <button onClick={closeSidebar} className="p-1.5 rounded-lg text-slate-400" aria-label="Menü schließen">
              <X size={20} />
            </button>
          </div>
          <Sidebar pathname={pathname} onNavClick={closeSidebar} onLogout={onLogout} />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0 pb-16 lg:pb-0">
          {/* Desktop header */}
          <header className="hidden lg:flex h-12 bg-white border-b border-slate-200 items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
            <div className="flex items-center gap-2 flex-1 max-w-md px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <span className="flex-1 text-[12px]">Buchung, Kunde, Seriennummer…</span>
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-500">⌘K</kbd>
            </div>
            <span className="ml-auto font-mono text-[11px] text-slate-500">{today}</span>
            <button className="p-2 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Benachrichtigungen"><Bell size={18} /></button>
            <div className="w-7 h-7 rounded-full bg-[#0f172a] text-white grid place-items-center text-[11px] font-semibold">LS</div>
          </header>

          <div className="flex-1 p-4 lg:p-5">{children}</div>
        </main>

        {/* Mobile bottom-tab-bar */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {BOTTOM_TABS.map((t) => {
            const on = bottomActive(t.href);
            const Icon = t.icon;
            if (t.scan) {
              return (
                <Link key={t.label} href={t.href} className="flex-1 flex flex-col items-center justify-center py-1.5" style={{ textDecoration: 'none' }}>
                  <span className="grid place-items-center w-11 h-11 -mt-5 rounded-full bg-cyan-500 text-white shadow-lg border-4 border-slate-100">
                    <ScanLine size={20} />
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{t.label}</span>
                </Link>
              );
            }
            return (
              <Link key={t.label} href={t.href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2" style={{ textDecoration: 'none' }}>
                <Icon size={19} className={on ? 'text-cyan-600' : 'text-slate-400'} />
                <span className={`text-[10px] ${on ? 'text-cyan-700 font-medium' : 'text-slate-500'}`}>{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </NotificationsProvider>
  );
}
