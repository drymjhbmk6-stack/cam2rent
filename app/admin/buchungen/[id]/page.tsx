'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ArrowLeftRight, Mail, CheckCircle2, Receipt, FileText, Package,
  ExternalLink, Download, ShieldCheck, AlertTriangle, Pencil, Plus, FileSignature,
  RotateCcw, Ban, Trash2, Send, Printer,
} from 'lucide-react';
import { Panel, KVBlock, Tabs, Button, BookingStatusChip, StatusChip } from '@/components/admin/ui';
import type { TabDef } from '@/components/admin/ui';
import { BOOKING_DETAIL as B } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Buchungsdetail (5 Tabs, statisch). */

const TABS: TabDef[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'versand', label: 'Versand & Rückgabe' },
  { key: 'dokumente', label: 'Dokumente & E-Mail' },
  { key: 'bearbeiten', label: 'Bearbeiten & Werkzeuge' },
  { key: 'status', label: 'Status & Verlauf' },
];

export default function BuchungDetailPage() {
  const params = useParams();
  const id = (typeof params?.id === 'string' ? params.id : B.id) || B.id;
  const [tab, setTab] = useState('uebersicht');

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/admin/buchungen" className="flex items-center gap-1 text-slate-500 hover:text-slate-900 text-[13px] w-fit">
        <ChevronLeft size={14} />Zurück zu Buchungen
      </Link>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight font-mono text-slate-900">{id}</h1>
        <BookingStatusChip status={B.status} />
        <span className="text-slate-400 text-[12px]">Erstellt am {B.erstellt}</span>
      </div>

      {/* Nächste Aktion */}
      <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Nächste Aktion</div>
          <div className="font-medium text-slate-900">Beim Kunden — Rückgabe steht aus</div>
        </div>
        <Button variant="primary" icon={ArrowLeftRight} className="bg-emerald-500 hover:bg-emerald-600">Rückgabe prüfen</Button>
      </div>

      {/* Kontext-Kopf (auf allen Tabs gleich) */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12px]">
        <KVInline k="Status"><span className="text-emerald-700 font-medium">Zugestellt</span></KVInline>
        <KVInline k="Produkt">{B.produkt}</KVInline>
        <KVInline k="Zeitraum">{B.zeitraum}</KVInline>
        <KVInline k="Kunde">{B.kunde}</KVInline>
        <KVInline k="Gesamt"><span className="font-semibold font-mono">{B.gesamt}</span></KVInline>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'uebersicht' && <Uebersicht />}
      {tab === 'versand' && <Versand />}
      {tab === 'dokumente' && <Dokumente />}
      {tab === 'bearbeiten' && <Bearbeiten />}
      {tab === 'status' && <Status />}
    </div>
  );
}

function KVInline({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{k}</span>
      <span className="text-slate-800">{children}</span>
    </div>
  );
}

/* ── Übersicht ── */
function Uebersicht() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Panel title="Buchungsdaten">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <KVBlock k="Produkt" v={B.produkt} />
            <KVBlock k="Seriennummer" v={B.serial} mono />
            <KVBlock k="Mietdauer" v={`${B.tage} Tage`} />
            <KVBlock k="Lieferart" v={B.lieferart} />
            <KVBlock k="Von" v="Mo. 13.07.2026" />
            <KVBlock k="Bis" v="Mo. 20.07.2026" />
            <KVBlock k="Verlängert" v="ursprgl. bis 19.07." accent />
            <KVBlock k="Haftung" v={B.haftung} />
            <KVBlock k="Payment Intent" v={B.paymentIntent} mono />
          </div>
        </Panel>
        <Panel title={`Zubehör & Set — Basic Set (${B.set.length} Teile)`} noBody>
          <table className="w-full">
            <tbody>
              {B.set.map((r, i) => (
                <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                  <td className="py-2 px-3">{r[0]}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{r[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Preisaufstellung">
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span>Miete ({B.tage} Tage)</span><span className="font-mono">{B.miete}</span></div>
            <div className="flex justify-between text-emerald-600"><span>Rabatt</span><span className="font-mono">{B.rabatt}</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-slate-100"><span>Gesamt</span><span className="font-mono">{B.gesamt}</span></div>
            <div className="pt-1">
              <StatusChip tone="emerald"><CheckCircle2 size={12} />Bezahlt (Stripe)</StatusChip>
            </div>
          </div>
        </Panel>
        <Panel title="Kunde">
          <div className="space-y-2">
            <div className="font-medium text-slate-900">{B.kunde}</div>
            <div className="text-cyan-700 text-[12px]">{B.mail}</div>
            <Button variant="primary" icon={Mail} fullWidth>Nachricht schreiben</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Versand & Rückgabe ── */
function Versand() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Versand & Tracking">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <KVBlock k="Trackingnummer" v={B.tracking} mono />
          <KVBlock k="Versandt am" v={B.versandtAm} />
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Tracking-Link</div>
            <span className="text-cyan-700 text-[12px] flex items-center gap-1 cursor-pointer"><ExternalLink size={12} />Sendung verfolgen</span>
          </div>
          <div className="col-span-2"><KVBlock k="Lieferadresse" v={B.adresse} /></div>
          <KVBlock k="Rückgabe" v="Noch nicht zurück" />
          <KVBlock k="Zustand" v="gut" />
          <div className="col-span-2 flex gap-3 pt-1">
            <span className="text-cyan-700 text-[12px] hover:underline flex items-center gap-1 cursor-pointer"><Printer size={12} />Versandlabel</span>
            <span className="text-cyan-700 text-[12px] hover:underline flex items-center gap-1 cursor-pointer"><RotateCcw size={12} />Rücksendeetikett</span>
          </div>
          <div className="col-span-2"><Button variant="primary" icon={ArrowLeftRight}>Rückgabe prüfen</Button></div>
        </div>
      </Panel>
      <Panel title="Versand-/Rückgabe-Termine" right={<StatusChip tone="amber">Manuell</StatusChip>}>
        <div className="space-y-3">
          <p className="text-slate-500 text-[12px]">Versand-Tag (vor Mietbeginn) und Rückgabe-Soll-Tag (nach Mietende) pro Buchung anpassbar. Leer = Standard-Puffer.</p>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Versand-Tag</div>
            <div className="px-3 py-2 rounded border border-slate-200 bg-slate-50 font-mono text-center">08.07.2026</div>
            <div className="text-[10px] text-slate-400 mt-1">Standard: 09.07. (4 Tage vor Mietbeginn)</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Rückgabe-Soll-Tag</div>
            <div className="px-3 py-2 rounded border border-slate-200 bg-white text-slate-400">— leer —</div>
            <div className="text-[10px] text-slate-400 mt-1">Standard: 24.07. (4 Tage nach Mietende)</div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm">Speichern</Button>
            <Button variant="secondary" size="sm">Auf Standard zurücksetzen</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ── Dokumente & E-Mail ── */
function Dokumente() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Mietvertrag">
        <div className="space-y-3">
          <StatusChip tone="emerald"><ShieldCheck size={12} />Unterschrieben</StatusChip>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <KVBlock k="Unterzeichnet am" v={B.vertragUnterzeichnet} />
            <KVBlock k="Unterzeichner" v={B.kunde} />
            <KVBlock k="Methode" v="Canvas-Unterschrift" />
            <KVBlock k="IP-Adresse" v={B.vertragIp} mono />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Dokument-Hash (SHA-256)</div>
            <div className="font-mono text-[10px] text-slate-500 break-all bg-slate-50 rounded p-2 border border-slate-100">{B.vertragHash}</div>
          </div>
          <div className="flex items-center gap-2 text-[11px] p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
            <CheckCircle2 size={14} className="shrink-0" /> Geprüft &amp; freigegeben — endgültig gesperrt, kann nicht zurückgesetzt werden.
          </div>
          <Button variant="secondary" icon={Download}>Vertrag PDF herunterladen</Button>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Dokumente & Aktionen">
          <div className="space-y-2">
            <Button variant="primary" icon={Mail} fullWidth>E-Mail senden</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" icon={Receipt}>Rechnung PDF</Button>
              <Button variant="secondary" size="sm" icon={FileSignature}>Vertrag PDF</Button>
              <Button variant="secondary" size="sm" icon={Package}>Paket packen</Button>
              <Button variant="secondary" size="sm" icon={FileText}>Packliste</Button>
            </div>
            <Button variant="destructive" size="sm" icon={AlertTriangle} fullWidth>Zubehör-Schaden melden</Button>
          </div>
        </Panel>
        <Panel title="Schadensmeldungen">
          <div className="space-y-2">
            <p className="text-slate-400 text-[12px]">Noch keine Schadensmeldungen zu dieser Buchung.</p>
            <Button variant="warning" size="sm" icon={Plus}>Schadensmeldung melden</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Bearbeiten & Werkzeuge ── */
function Bearbeiten() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Wiederbeschaffung & Haftung (intern)" right={<span className="text-cyan-700 text-[12px] flex items-center gap-1 cursor-pointer"><Pencil size={12} />Bearbeiten</span>}>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Kompletter Wiederbeschaffungswert</div>
            <div className="text-2xl font-bold font-mono text-slate-900">{B.wbwGesamt}</div>
            <div className="text-slate-400 text-[11px]">Was du faktisch ausgeben müsstest, um alle Mietgegenstände zu ersetzen.</div>
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {B.wbw.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5">
                    {r[0]}
                    {r[2] && <span className="block text-[10px] text-slate-400">{r[2]}</span>}
                  </td>
                  <td className="py-1.5 text-right font-mono">{r[1]}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-medium">
                <td className="py-1.5 text-slate-500">Zubehör-Summe</td>
                <td className="py-1.5 text-right font-mono">{B.wbwZubehoer}</td>
              </tr>
            </tbody>
          </table>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Vom Kunden gewählt: ohne Schadenspauschale</div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-rose-800">Max. Übernahmebetrag durch Kunde</span>
              <span className="font-bold font-mono text-rose-700">{B.wbwGesamt}</span>
            </div>
            <p className="text-[11px] text-rose-700/80 mt-1">Kunde haftet bis zum vollen Wiederbeschaffungswert pro Position. Forderung manuell.</p>
          </div>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Bestellung bearbeiten">
          <div className="space-y-2">
            <p className="text-slate-500 text-[12px]">Mietzeitraum, Kamera, Set/Zubehör und Haftungsschutz ändern. Wirkt sofort auf die echte Buchung. Preisdifferenz per Zahlungslink oder Rückerstattung.</p>
            <Button variant="secondary" size="sm" icon={Pencil}>Bestellung bearbeiten</Button>
          </div>
        </Panel>
        <Panel title="Abweichende Rechnungsadresse">
          <div className="space-y-2">
            <p className="text-slate-400 text-[12px]">Keine abweichende Rechnungsadresse hinterlegt. Es wird die Versand-/Profil-Adresse verwendet.</p>
            <Button variant="secondary" size="sm" icon={Plus}>Abweichende Adresse hinzufügen</Button>
          </div>
        </Panel>
        <Panel title="Rechnungsversionen">
          <div className="space-y-2">
            <p className="text-slate-400 text-[11px]">Jede Fassung wird intern archiviert. Die aktuelle Fassung kannst du dem Kunden als angepasste Rechnung schicken.</p>
            {B.rechnungen.map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded border border-slate-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[12px]">{r.titel}</span>
                    {r.aktuell && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">AKTUELL</span>}
                  </div>
                  <div className="text-[10px] text-slate-400">{r.datum} · {r.betrag} · {r.sub}</div>
                </div>
                <span className="text-cyan-700 text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"><FileText size={12} />PDF</span>
              </div>
            ))}
            <Button variant="primary" size="sm" icon={Send} fullWidth>Angepasste Rechnung an Kunden senden</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Status & Verlauf ── */
const DOT: Record<'cyan' | 'emerald', string> = { cyan: 'bg-cyan-500', emerald: 'bg-emerald-500' };
function Status() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Statusverlauf">
        <ul className="space-y-0">
          {B.verlauf.map((v, i) => (
            <li key={i} className="flex gap-3 pb-4 last:pb-0 relative">
              {i < B.verlauf.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-slate-200" />}
              <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${DOT[v.tone]}`} />
              <div>
                <div className="font-medium text-slate-900">{v.t}</div>
                <div className="text-slate-400 text-[11px] font-mono">{v.d}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Aktionen">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Status ändern</div>
            <div className="flex gap-2">
              <select className="flex-1 px-3 py-2 rounded border border-slate-200 bg-white text-[13px]">
                <option>Zugestellt</option><option>Rücksendung</option><option>Eingegangen</option>
                <option>Geprüft</option><option>Abgeschlossen</option>
              </select>
              <Button variant="primary">Speichern</Button>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
            <Button variant="destructive" size="sm" icon={Ban}>Stornieren</Button>
            <Button variant="destructive" size="sm" icon={Trash2}>Endgültig löschen</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
