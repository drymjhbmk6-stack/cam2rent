import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/belege/[id]/aufheben
 *
 * Macht die Festschreibung rueckgaengig — fuer Korrekturen an einer falschen
 * Klassifikation. Setzt den Beleg auf `klassifiziert` zurueck und entfernt
 * alle Auto-Generate-Artefakte (Assets + AfA-Buchungen aus der Sofort-GWG
 * bzw. aus der linearen AfA).
 *
 * SICHERHEITS-CHECKS — Aufheben wird mit 409 abgelehnt wenn:
 *  - Es existieren AfA-Buchungen mit typ='monatlich' (der monatliche Cron
 *    hat schon weitergeschrieben). Wuerde sonst Wertverlauf verfaelschen.
 *  - Asset-Status ist nicht 'aktiv' (verkauft / ausgemustert / verloren) —
 *    dann sind Folge-Buchungen drum herum, die wir nicht zuverlaessig
 *    rueckabwickeln koennen.
 *
 * Was NICHT angefasst wird:
 *  - inventar_verknuepfung-Eintraege (Inventar-Stuecke bleiben verlinkt)
 *  - inventar_units (physische Stuecke bleiben bestehen)
 *  - beleg_anhaenge / Storage
 *  - interne_beleg_no (bleibt belegt — bei Re-Festschreibung wird dieselbe
 *    Nummer wiederverwendet, das ist GoBD-konform).
 *
 * Was zurueckgesetzt wird:
 *  - belege.status = 'klassifiziert', festgeschrieben_at = NULL
 *  - beleg_positionen.locked = false (alle Positionen)
 *  - assets/assets_neu mit beleg_position_id IN (positionen) → DELETE
 *  - afa_buchungen fuer diese assets → CASCADE oder explizit
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg, error: loadErr } = await supabase
    .from('belege').select('id, beleg_nr, status').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (beleg.status !== 'festgeschrieben') {
    return NextResponse.json({ error: 'Beleg ist nicht festgeschrieben — nichts zum Aufheben.' }, { status: 400 });
  }

  // Alle Positionen holen, um beleg_position_ids fuer asset-lookup zu haben
  const { data: positionen } = await supabase
    .from('beleg_positionen').select('id').eq('beleg_id', id);
  const posIds = (positionen ?? []).map((p) => (p as { id: string }).id);

  // Assets in BEIDEN Tabellen suchen (assets_neu + assets, defensiv).
  // Schema-Cache-Miss-Helfer aus dem Auto-Generator nachgebaut.
  const isMissingTable = (e: { code?: string; message?: string } | null | undefined): boolean => {
    if (!e) return false;
    if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202') return true;
    if (typeof e.message === 'string' && /could not find the table|schema cache/i.test(e.message)) return true;
    return false;
  };

  type AssetRow = { id: string; beleg_position_id: string; status: string };
  const assets: Array<{ id: string; status: string; table: 'assets_neu' | 'assets' }> = [];

  if (posIds.length > 0) {
    const probeNeu = await supabase
      .from('assets_neu').select('id, beleg_position_id, status').in('beleg_position_id', posIds);
    if (!isMissingTable(probeNeu.error)) {
      for (const a of (probeNeu.data ?? []) as AssetRow[]) {
        assets.push({ id: a.id, status: a.status, table: 'assets_neu' });
      }
    }
    const probeAlt = await supabase
      .from('assets').select('id, beleg_position_id, status').in('beleg_position_id', posIds);
    if (!isMissingTable(probeAlt.error)) {
      for (const a of (probeAlt.data ?? []) as AssetRow[]) {
        // Doppel-Vorkommen vermeiden (selbe id in beiden Tabellen sollte nie
        // passieren, aber defensiv)
        if (!assets.some((x) => x.id === a.id)) {
          assets.push({ id: a.id, status: a.status, table: 'assets' });
        }
      }
    }
  }

  // Sicherheits-Check 1: keine Assets mit nicht-aktivem Status
  const blockedByStatus = assets.filter((a) => a.status !== 'aktiv');
  if (blockedByStatus.length > 0) {
    return NextResponse.json({
      error: `Aufheben nicht moeglich — ${blockedByStatus.length} verknuepfte Anlage(n) sind nicht mehr aktiv (verkauft/ausgemustert/verloren). Storno wuerde Folgebuchungen kaputtmachen.`,
    }, { status: 409 });
  }

  // Sicherheits-Check 2: keine AfA-Buchungen mit typ='monatlich' (Cron-Lauf)
  let monthlyAfaCount = 0;
  if (assets.length > 0) {
    const assetIds = assets.map((a) => a.id);
    const { data: monthlyAfa } = await supabase
      .from('afa_buchungen')
      .select('id', { count: 'exact', head: false })
      .in('asset_id', assetIds)
      .eq('typ', 'monatlich');
    monthlyAfaCount = (monthlyAfa ?? []).length;
  }
  if (monthlyAfaCount > 0) {
    return NextResponse.json({
      error: `Aufheben nicht moeglich — der monatliche AfA-Cron hat bereits ${monthlyAfaCount} Folge-Buchung(en) erzeugt. Bitte Buchhalter kontaktieren.`,
    }, { status: 409 });
  }

  // Ab hier: rueckabwickeln. Reihenfolge: erst afa_buchungen (FK auf assets),
  // dann assets, dann positionen entlocken, zuletzt belege-status.
  let afaDeleted = 0;
  if (assets.length > 0) {
    const assetIds = assets.map((a) => a.id);
    const { error: afaDelErr, count } = await supabase
      .from('afa_buchungen').delete({ count: 'exact' }).in('asset_id', assetIds);
    if (afaDelErr) {
      return NextResponse.json({ error: `AfA-Buchungen konnten nicht geloescht werden: ${afaDelErr.message}` }, { status: 500 });
    }
    afaDeleted = count ?? 0;
  }

  let assetsDeleted = 0;
  for (const a of assets) {
    const { error: delErr } = await supabase.from(a.table).delete().eq('id', a.id);
    if (delErr) {
      return NextResponse.json({ error: `Anlage ${a.id} (${a.table}) konnte nicht geloescht werden: ${delErr.message}` }, { status: 500 });
    }
    assetsDeleted++;
  }

  // Positionen entlocken
  const { error: posUnlockErr } = await supabase
    .from('beleg_positionen').update({ locked: false }).eq('beleg_id', id);
  if (posUnlockErr) {
    return NextResponse.json({ error: `Positionen konnten nicht entsperrt werden: ${posUnlockErr.message}` }, { status: 500 });
  }

  // Beleg-Status zurueck. Optimistic concurrency — falls jemand parallel
  // den Status veraendert hat, brechen wir ab.
  const { error: belegUpdErr, data: updated } = await supabase
    .from('belege')
    .update({
      status: 'klassifiziert',
      festgeschrieben_at: null,
    })
    .eq('id', id)
    .eq('status', 'festgeschrieben')
    .select('id')
    .maybeSingle();
  if (belegUpdErr) {
    return NextResponse.json({ error: belegUpdErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Beleg-Status hat sich zwischenzeitlich geaendert.' }, { status: 409 });
  }

  await logAudit({
    action: 'beleg.aufheben',
    entityType: 'beleg',
    entityId: id,
    entityLabel: beleg.beleg_nr,
    changes: {
      assets_deleted: assetsDeleted,
      afa_buchungen_deleted: afaDeleted,
    },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    assets_deleted: assetsDeleted,
    afa_buchungen_deleted: afaDeleted,
  });
}
