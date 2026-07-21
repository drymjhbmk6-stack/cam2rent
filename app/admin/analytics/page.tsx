'use client';

import { useState } from 'react';
import { BarChart3, Users, ShoppingCart, FileText, Radio } from 'lucide-react';
import { PageHeader, Panel, Tabs, FilterPills, StatRows, MiniStat } from '@/components/admin/ui';
import type { TabDef, PillDef } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Statistiken (Design-Prototyp, statische Beispieldaten).
   Zeitraum-Pills + 4 Tabs, CSS-Balken statt Chart-Library. */

const RANGE_PILLS: PillDef[] = [
  { key: 'heute', label: 'Heute', tone: 'cyan' },
  { key: '7', label: '7 Tage', tone: 'cyan' },
  { key: '30', label: '30 Tage', tone: 'cyan' },
  { key: 'monat', label: 'Monat', tone: 'cyan' },
  { key: 'jahr', label: 'Jahr', tone: 'cyan' },
];

const TABS: TabDef[] = [
  { key: 'traffic', label: 'Besucher & Marketing', icon: BarChart3 },
  { key: 'bookings', label: 'Buchungen', icon: ShoppingCart },
  { key: 'customers', label: 'Kunden', icon: Users },
  { key: 'blog', label: 'Blog', icon: FileText },
];

/* ── CSS-Balken-Helfer ── */
function VBars({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-stretch gap-1 h-40">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col justify-end">
            <div className="text-[9px] font-mono text-slate-400 text-center leading-none mb-0.5">{v || ''}</div>
            <div
              className="w-full rounded-t bg-cyan-500"
              style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              title={`${labels[i]}: ${v}`}
            />
          </div>
          <div className="text-[9px] text-slate-400 text-center truncate mt-1">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-[12px] text-slate-700 truncate">{label}</span>
      <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
        <div className="h-2 rounded bg-cyan-500" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="w-16 text-right font-mono text-[12px] text-slate-900 shrink-0">
        {value}
        {unit ? <span className="text-slate-400 ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}

/* Nur jede 3. Stunde beschriftet, damit 24 Balken luftig bleiben. */
const HOUR_VIEWS = [2, 1, 0, 0, 0, 1, 3, 6, 9, 14, 18, 21, 24, 19, 16, 22, 27, 31, 34, 29, 21, 14, 8, 4];
const HOUR_LABELS = HOUR_VIEWS.map((_, i) => (i % 3 === 0 ? String(i) : ''));

const DAY_LABELS_14 = ['08.', '09.', '10.', '11.', '12.', '13.', '14.', '15.', '16.', '17.', '18.', '19.', '20.', '21.'];
const BOOKINGS_14 = [1, 0, 2, 1, 3, 2, 1, 0, 2, 4, 1, 2, 3, 2];
const BLOG_VIEWS_14 = [12, 18, 9, 22, 30, 14, 11, 25, 33, 19, 27, 21, 16, 24];

export default function AnalyticsPage() {
  const [range, setRange] = useState('heute');
  const [tab, setTab] = useState('traffic');

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Statistiken" subtitle="Besucher, Buchungen, Kunden und Blog — auf einen Blick." />

      <FilterPills pills={RANGE_PILLS} active={range} onChange={setRange} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'traffic' && <TrafficTab />}
      {tab === 'bookings' && <BookingsTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'blog' && <BlogTab />}

      <p className="text-slate-400 text-[11px]">Design-Prototyp · Beispieldaten · noch keine Live-Daten angebunden.</p>
    </div>
  );
}

function TrafficTab() {
  const topPages = [
    { path: '/', views: 412 },
    { path: '/kameras', views: 287 },
    { path: '/kameras/gopro-hero13', views: 154 },
    { path: '/set-konfigurator', views: 98 },
    { path: '/blog', views: 63 },
  ];
  const sources = [
    { src: 'Google (organisch)', views: 521 },
    { src: 'Direkt', views: 318 },
    { src: 'Instagram', views: 142 },
    { src: 'Facebook', views: 74 },
    { src: 'Newsletter', views: 39 },
  ];
  const maxPages = Math.max(...topPages.map((p) => p.views));
  const maxSrc = Math.max(...sources.map((s) => s.views));

  return (
    <div className="space-y-4">
      <StatRows
        groups={[
          {
            label: 'Reichweite',
            items: [
              { value: '1.094', label: 'Aufrufe' },
              { value: '683', label: 'Besucher', tone: 'accent' },
              { value: '1,6', label: 'Seiten/Besuch' },
              { value: '42 %', label: 'Absprungrate' },
            ],
          },
        ]}
      />
      <div className="flex gap-3 flex-wrap">
        <MiniStat value="7" label="gerade online" tone="accent" />
        <MiniStat value="38 %" label="neue Besucher" />
        <MiniStat value="62 %" label="wiederkehrend" tone="emerald" />
      </div>

      <Panel title={<span className="flex items-center gap-2"><Radio size={12} className="text-cyan-500" />Aufrufe heute nach Stunde</span>}>
        <VBars data={HOUR_VIEWS} labels={HOUR_LABELS} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Top-Seiten">
          <div className="space-y-2.5">
            {topPages.map((p) => (
              <HBar key={p.path} label={p.path} value={p.views} max={maxPages} />
            ))}
          </div>
        </Panel>
        <Panel title="Traffic-Quellen">
          <div className="space-y-2.5">
            {sources.map((s) => (
              <HBar key={s.src} label={s.src} value={s.views} max={maxSrc} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BookingsTab() {
  const funnel = [
    { step: 'Produkt angesehen', count: 683, pct: 100 },
    { step: 'Buchung gestartet', count: 214, pct: 31 },
    { step: 'Zubehör gewählt', count: 148, pct: 22 },
    { step: 'Zusammenfassung', count: 96, pct: 14 },
    { step: 'Bezahlt', count: 41, pct: 6 },
  ];
  const products = [
    { name: 'GoPro Hero13 Black', bookings: 18 },
    { name: 'DJI Osmo Action 5 Pro', bookings: 14 },
    { name: 'Insta360 X4', bookings: 11 },
    { name: 'DJI Osmo Nano', bookings: 7 },
    { name: 'GoPro Hero12 Black', bookings: 5 },
  ];
  const maxProd = Math.max(...products.map((p) => p.bookings));
  const maxFunnel = funnel[0].count;

  return (
    <div className="space-y-4">
      <StatRows
        groups={[
          {
            label: 'Buchungen',
            items: [
              { value: '41', label: 'Buchungen', tone: 'accent' },
              { value: '3.284 €', label: 'Umsatz', tone: 'strong' },
              { value: '6,0 %', label: 'Abschlussquote' },
              { value: '80,10 €', label: 'Ø Buchungswert' },
            ],
          },
        ]}
      />

      <Panel title="Buchungen letzte 14 Tage">
        <VBars data={BOOKINGS_14} labels={DAY_LABELS_14} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Buchungstrichter">
          <div className="space-y-2.5">
            {funnel.map((f) => (
              <div key={f.step} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[12px] text-slate-700 truncate">{f.step}</span>
                <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                  <div className="h-2 rounded bg-cyan-500" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
                <span className="w-20 text-right font-mono text-[12px] text-slate-900 shrink-0">
                  {f.count} <span className="text-slate-400">· {f.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Top-Kameras (nach Buchungen)">
          <div className="space-y-2.5">
            {products.map((p) => (
              <HBar key={p.name} label={p.name} value={p.bookings} max={maxProd} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CustomersTab() {
  const devices = [
    { name: 'Mobile', pct: 58 },
    { name: 'Desktop', pct: 36 },
    { name: 'Tablet', pct: 6 },
  ];
  const countries = [
    { name: 'Deutschland', count: 641 },
    { name: 'Österreich', count: 24 },
    { name: 'Schweiz', count: 12 },
    { name: 'Niederlande', count: 6 },
  ];
  const maxC = Math.max(...countries.map((c) => c.count));

  return (
    <div className="space-y-4">
      <StatRows
        groups={[
          {
            label: 'Kundschaft',
            items: [
              { value: '25', label: 'Kunden gesamt' },
              { value: '9', label: 'Wiederkehrer', tone: 'accent' },
              { value: '36 %', label: 'Repeat-Rate' },
              { value: '184 €', label: 'Ø Lifetime-Wert', tone: 'strong' },
            ],
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Geräte">
          <div className="space-y-2.5">
            {devices.map((d) => (
              <HBar key={d.name} label={d.name} value={d.pct} max={100} unit="%" />
            ))}
          </div>
        </Panel>
        <Panel title="Herkunftsländer">
          <div className="space-y-2.5">
            {countries.map((c) => (
              <HBar key={c.name} label={c.name} value={c.count} max={maxC} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BlogTab() {
  const articles = [
    { title: 'GoPro Hero13 im Wassersport-Test', views: 214 },
    { title: 'Die besten Action-Cams 2026', views: 178 },
    { title: 'Insta360 X4 — 360°-Guide', views: 132 },
    { title: 'Skitour filmen: 5 Tipps', views: 96 },
    { title: 'Vlog-Setup für Einsteiger', views: 61 },
  ];
  const maxA = Math.max(...articles.map((a) => a.views));

  return (
    <div className="space-y-4">
      <StatRows
        groups={[
          {
            label: 'Blog',
            items: [
              { value: '34', label: 'Artikel gesamt' },
              { value: '28', label: 'Veröffentlicht', tone: 'accent' },
              { value: '6', label: 'Entwürfe' },
              { value: '681', label: 'Aufrufe', tone: 'strong' },
            ],
          },
        ]}
      />

      <Panel title="Blog-Aufrufe letzte 14 Tage">
        <VBars data={BLOG_VIEWS_14} labels={DAY_LABELS_14} />
      </Panel>

      <Panel title="Meistgelesene Artikel">
        <div className="space-y-2.5">
          {articles.map((a) => (
            <HBar key={a.title} label={a.title} value={a.views} max={maxA} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
