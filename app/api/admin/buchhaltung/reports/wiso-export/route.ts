import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { buildCsvRow } from '@/lib/csv';
import { computeEuerData } from '@/lib/buchhaltung/euer-data';

/**
 * Buchungsgenauer CSV-Export fuer den EÜR-Import in WISO Steuer:Sparbuch
 * (Windows) → Menue "Daten im-/exportieren" in der EÜR, Spalten-Zuordnungs-
 * Assistent.
 *
 * Eine Zeile pro Einnahmen-/Ausgaben-Posten. Betraege sind POSITIVE Absolut-
 * werte (kein fuehrendes Minus) — sonst wuerde der Formula-Injection-Schutz
 * (lib/csv.ts) ein Apostroph voranstellen und WISO die Zelle als Text statt
 * Zahl lesen. Einnahme vs. Ausgabe steht in der eigenen Spalte "Typ", die man
 * im WISO-Assistenten den jeweiligen EÜR-Konten zuordnet.
 *
 * Zahlen sind byte-identisch zur EÜR-Ansicht (gemeinsame Quelle
 * lib/buchhaltung/euer-data.ts).
 */

// deutsches Datum TT.MM.JJJJ — WISO-Default. Faellt auf den Original-String
// zurueck, wenn nicht als YYYY-MM-DD parsebar.
function toDeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
}

// deutsche Betragsdarstellung ohne Waehrungssymbol (WISO importiert Zahlen).
function fmtBetrag(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const data = await computeEuerData(supabase, from, to);

  type Row = { date: string; betrag: number; typ: 'Einnahme' | 'Ausgabe'; kategorie: string; text: string };
  const rows: Row[] = [];

  // Einnahmen — eine Zeile pro Buchungs-Posten (netto nach Rabatt/Erstattung).
  const incomeGroups: Array<{ kategorie: string; items: typeof data.income.items.rental }> = [
    { kategorie: 'Kamera-Miete', items: data.income.items.rental },
    { kategorie: 'Zubehör & Sets', items: data.income.items.accessories },
    { kategorie: 'Haftungsschutz', items: data.income.items.haftung },
    { kategorie: 'Versandkostenpauschale', items: data.income.items.shipping },
  ];
  for (const g of incomeGroups) {
    for (const it of g.items) {
      if (it.amount <= 0) continue; // 0-EUR-Posten (voll rabattiert/erstattet) weglassen
      rows.push({
        date: it.date,
        betrag: it.amount,
        typ: 'Einnahme',
        kategorie: g.kategorie,
        text: it.note ? `${it.description} (${it.note})` : it.description,
      });
    }
  }

  // Ausgaben — eine Zeile pro Ausgaben-Posten je Kategorie.
  for (const cat of data.expenses.categories) {
    for (const it of cat.items) {
      if (it.amount <= 0) continue;
      const text = [it.vendor, it.description].filter(Boolean).join(' · ');
      rows.push({
        date: it.date,
        betrag: it.amount,
        typ: 'Ausgabe',
        kategorie: cat.label,
        text: text || cat.label,
      });
    }
  }

  // chronologisch sortieren (Datum aufsteigend, Einnahmen vor Ausgaben bei
  // gleichem Datum fuer eine ruhige Liste).
  rows.sort((a, b) => {
    const da = (a.date || '').localeCompare(b.date || '');
    if (da !== 0) return da;
    return a.typ === b.typ ? 0 : a.typ === 'Einnahme' ? -1 : 1;
  });

  const header = ['Datum', 'Betrag', 'Typ', 'Kategorie', 'Buchungstext'];
  const csvRows = [header, ...rows.map((r) => [
    toDeDate(r.date),
    fmtBetrag(r.betrag),
    r.typ,
    r.kategorie,
    r.text,
  ])];

  const csv = '﻿' + csvRows.map((r) => buildCsvRow(r, ';')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wiso-euer-${from}-${to}.csv"`,
    },
  });
}
