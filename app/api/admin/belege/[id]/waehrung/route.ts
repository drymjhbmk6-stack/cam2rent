import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';

/**
 * POST /api/admin/belege/[id]/waehrung
 *
 * Fremdwaehrungs-Umrechnung eines Belegs anpassen. Zwei Aktionen:
 *
 *   { action: 'set_rate', rate: <EUR pro 1 Einheit Fremdwaehrung> }
 *     Skaliert alle Positions-Netto-Preise linear auf den neuen Kurs
 *     (Faktor = neuerKurs / bisherigerKurs, bzw. = neuerKurs falls noch
 *     nicht umgerechnet) und schreibt den Kurs an den Beleg. Summen werden
 *     neu berechnet.
 *
 *   { action: 'dismiss' }
 *     Blendet den Umrechnungs-Hinweis aus (Admin hat die Betraege geprueft).
 *
 * Festgeschriebene Belege sind gesperrt (409).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: beleg, error: loadErr } = await supabase
    .from('belege')
    .select('id, status, fremdwaehrung, wechselkurs')
    .eq('id', id)
    .single();
  if (loadErr) {
    if (/fremdwaehrung|wechselkurs/i.test(loadErr.message)) {
      return NextResponse.json({ error: 'Fremdwaehrungs-Funktion nicht aktiv (Migration fehlt)' }, { status: 503 });
    }
    return NextResponse.json({ error: loadErr.message }, { status: 404 });
  }
  if ((beleg as { status: string }).status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschriebener Beleg — keine Aenderung' }, { status: 409 });
  }
  if (!(beleg as { fremdwaehrung: string | null }).fremdwaehrung) {
    return NextResponse.json({ error: 'Beleg ist nicht in Fremdwaehrung' }, { status: 400 });
  }

  const action = body.action;

  // --- Dismiss ---
  if (action === 'dismiss') {
    const { error } = await supabase
      .from('belege')
      .update({ waehrung_hinweis_dismissed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({ action: 'beleg.waehrung_dismiss', entityType: 'beleg', entityId: id, request: req });
    return NextResponse.json({ ok: true });
  }

  // --- Kurs setzen / neu umrechnen ---
  if (action === 'set_rate') {
    const newRate = Number(body.rate);
    if (!Number.isFinite(newRate) || newRate <= 0 || newRate > 100000) {
      return NextResponse.json({ error: 'Ungueltiger Kurs' }, { status: 400 });
    }
    const oldRate = Number((beleg as { wechselkurs: number | null }).wechselkurs);
    // Faktor: bereits umgerechnet -> von altem auf neuen Kurs re-skalieren;
    // noch nicht umgerechnet (kein/0 Kurs) -> Rohbetrag * neuer Kurs.
    const factor = Number.isFinite(oldRate) && oldRate > 0 ? newRate / oldRate : newRate;

    const { data: positionen, error: posErr } = await supabase
      .from('beleg_positionen')
      .select('id, einzelpreis_netto, locked')
      .eq('beleg_id', id);
    if (posErr) return NextResponse.json({ error: posErr.message }, { status: 500 });
    if ((positionen ?? []).some((p) => (p as { locked: boolean }).locked)) {
      return NextResponse.json({ error: 'Positionen gesperrt (festgeschrieben)' }, { status: 409 });
    }

    for (const p of positionen ?? []) {
      const cur = Number((p as { einzelpreis_netto: number }).einzelpreis_netto) || 0;
      const next = Math.round(cur * factor * 100) / 100;
      const { error: updErr } = await supabase
        .from('beleg_positionen')
        .update({ einzelpreis_netto: next })
        .eq('id', (p as { id: string }).id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await recomputeBelegSummen(supabase, id);
    await supabase
      .from('belege')
      .update({ wechselkurs: newRate, wechselkurs_datum: new Date().toISOString().slice(0, 10) })
      .eq('id', id);

    await logAudit({
      action: 'beleg.waehrung_set_rate',
      entityType: 'beleg',
      entityId: id,
      changes: { old_rate: Number.isFinite(oldRate) ? oldRate : null, new_rate: newRate, positions: (positionen ?? []).length },
      request: req,
    });
    return NextResponse.json({ ok: true, rate: newRate });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
