'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Button, Field, Input, EmptyState } from '@/components/admin/ui';
import { useToast, useConfirm } from '@/components/admin/ui/FeedbackProvider';

interface Period {
  id: string;
  from: string;
  to: string;
  note?: string;
}

interface AffectedBooking {
  id: string;
  customer_name: string | null;
  product_name: string | null;
  rental_from: string;
  rental_to: string;
  status: string;
  delivery_mode: string | null;
}

function fmt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function todayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export default function UrlaubPage() {
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [affected, setAffected] = useState<Record<string, AffectedBooking[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/urlaub', { cache: 'no-store' });
      const d = await res.json();
      setPeriods(Array.isArray(d.periods) ? d.periods : []);
      setAffected(d.affected ?? {});
    } catch {
      toastError('Urlaubszeiten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: Period[], msg: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/urlaub', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periods: next }),
      });
      if (!res.ok) throw new Error();
      success(msg);
      await load();
    } catch {
      toastError('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!from) {
      toastError('Bitte ein Startdatum wählen.');
      return;
    }
    const end = to || from;
    if (end < from) {
      toastError('Das Enddatum liegt vor dem Startdatum.');
      return;
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await save([...periods, { id, from, to: end, note: note.trim() || undefined }], 'Urlaub eingetragen — Kameras sind in diesem Zeitraum gesperrt.');
    setFrom('');
    setTo('');
    setNote('');
  }

  async function handleRemove(p: Period) {
    const ok = await confirm({
      title: 'Urlaub entfernen?',
      message: `Der Urlaub vom ${fmt(p.from)} bis ${fmt(p.to)} wird gelöscht. Die Kameras sind in diesem Zeitraum danach wieder buchbar.`,
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!ok) return;
    await save(periods.filter((x) => x.id !== p.id), 'Urlaub entfernt — Zeitraum wieder buchbar.');
  }

  const today = todayBerlin();
  const upcoming = periods.filter((p) => p.to >= today);
  const past = periods.filter((p) => p.to < today);
  const current = upcoming.find((p) => p.from <= today);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title="Urlaubsmodus"
        subtitle="Trage ein, wann du nicht da bist — alle noch freien Kameras werden in dieser Zeit für neue Buchungen gesperrt."
      />

      {current && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: 'var(--admin-text)',
            fontSize: 14,
          }}
        >
          🌴 <strong>Urlaubsmodus aktiv</strong> — bis {fmt(current.to)}.
        </div>
      )}

      <Card style={{ marginBottom: 20 }}>
        <h2 className="font-heading" style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--admin-heading)' }}>
          Neuen Urlaub eintragen
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <Field label="Von (erster Urlaubstag)">
            <Input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Bis (letzter Urlaubstag)">
            <Input type="date" value={to} min={from || today} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Hinweis für Kunden (optional)" hint="Erscheint im Buchungskalender beim Darüberfahren." style={{ marginTop: 12 }}>
          <Input value={note} maxLength={200} placeholder="z.B. Betriebsferien" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={handleAdd} loading={saving} disabled={!from}>
            Urlaub eintragen
          </Button>
          {from && (
            <span style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
              {dayCount(from, to && to >= from ? to : from)} Tag(e)
            </span>
          )}
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--admin-muted)', lineHeight: 1.5 }}>
          So wirkt es: Im Urlaub kann nichts versendet, übergeben oder zurückgenommen werden. Deshalb sind
          auch die Tage direkt davor und danach gesperrt, an denen Versand oder Rücksendung einer neuen
          Buchung in den Urlaub fallen würden (Puffertage aus den Einstellungen). Bereits bestehende
          Buchungen bleiben unverändert — sie stehen unten, damit du sie vorher bzw. nachher erledigen
          kannst. Manuelle Buchungen im Admin sind weiterhin möglich.
        </p>
      </Card>

      <h2 className="font-heading" style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: 'var(--admin-heading)' }}>
        Geplante Urlaube
      </h2>

      {loading ? (
        <Card><span style={{ color: 'var(--admin-muted)', fontSize: 14 }}>Lädt…</span></Card>
      ) : upcoming.length === 0 ? (
        <EmptyState title="Kein Urlaub geplant" description="Alle Kameras sind normal buchbar." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {upcoming.map((p) => {
            const list = affected[p.id] ?? [];
            const active = p.from <= today;
            return (
              <Card key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--admin-heading)' }}>
                      {active ? '🌴 ' : '📅 '}
                      {fmt(p.from)} – {fmt(p.to)}
                      <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--admin-muted)' }}>
                        {dayCount(p.from, p.to)} Tag(e){active ? ' · läuft gerade' : ''}
                      </span>
                    </div>
                    {p.note && <div style={{ marginTop: 4, fontSize: 14, color: 'var(--admin-text-2)' }}>{p.note}</div>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleRemove(p)} disabled={saving}>
                    Entfernen
                  </Button>
                </div>

                {list.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 10,
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 6 }}>
                      ⚠ {list.length} bestehende Buchung(en) mit Versand/Rückgabe im Urlaub
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--admin-text-2)', lineHeight: 1.7 }}>
                      {list.map((b) => (
                        <li key={b.id}>
                          <Link href={`/admin/buchungen/${b.id}`} style={{ color: 'var(--admin-accent)' }}>
                            {b.id}
                          </Link>{' '}
                          · {b.customer_name || 'Unbekannt'} · {b.product_name || '—'} · {fmt(b.rental_from)} – {fmt(b.rental_to)}
                          {b.delivery_mode === 'abholung' ? ' · Abholung' : ' · Versand'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--admin-accent)', cursor: 'pointer', fontSize: 14, padding: 0 }}
          >
            {showPast ? '▾' : '▸'} Vergangene Urlaube ({past.length})
          </button>
          {showPast && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((p) => (
                <Card key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, color: 'var(--admin-text-2)' }}>
                    {fmt(p.from)} – {fmt(p.to)}{p.note ? ` · ${p.note}` : ''}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(p)} disabled={saving}>
                    Löschen
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
