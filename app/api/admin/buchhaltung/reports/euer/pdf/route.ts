import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getSiteUrl } from '@/lib/env-mode';

// Placeholder — generiert eine einfache Text-Repräsentation der EÜR
// Vollständige React-PDF-Implementierung kann in zukünftiger Session folgen
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  // EÜR-Daten über interne API laden
  const baseUrl = await getSiteUrl();
  const euerRes = await fetch(`${baseUrl}/api/admin/buchhaltung/reports/euer?from=${from}&to=${to}`, {
    headers: { cookie: req.headers.get('cookie') || '' },
  });

  if (!euerRes.ok) {
    return NextResponse.json({ error: 'EÜR-Daten konnten nicht geladen werden.' }, { status: 500 });
  }

  const data = await euerRes.json();

  // CSV als einfache Alternative bis React-PDF implementiert ist
  const lines = [
    `Einnahmen-Überschuss-Rechnung cam2rent`,
    `Zeitraum: ${from} bis ${to}`,
    `Steuermodus: ${data.taxMode === 'kleinunternehmer' ? 'Kleinunternehmer (§19 UStG)' : 'Regelbesteuerung'}`,
    '',
    'EINNAHMEN',
    `Kamera-Miete;${fmt(data.income.rental)}`,
    `Zubehör & Sets;${fmt(data.income.accessories ?? 0)}`,
    `Haftungsschutz;${fmt(data.income.haftung)}`,
    `Versandkostenpauschalen;${fmt(data.income.shipping)}`,
    `Sonstige Einnahmen;${fmt(data.income.other)}`,
    `Gewährte Rabatte;${fmt(-(data.income.discounts ?? 0))}`,
    `Summe Einnahmen;${fmt(data.income.total)}`,
    '',
    `Buchungen gesamt;${data.bookingStats?.count ?? 0}`,
    `davon Versand;${data.bookingStats?.shipped ?? 0}`,
    `davon Abholung;${data.bookingStats?.pickup ?? 0}`,
    '',
    'AUSGABEN',
    ...(data.expenses.categories || []).flatMap((c: {
      label: string;
      amount: number;
      items?: Array<{ date: string; vendor: string; description: string; amount: number }>;
    }) => {
      const lines: string[] = [`${c.label};${fmt(c.amount)}`];
      for (const it of c.items ?? []) {
        const desc = [it.vendor, it.description].filter(Boolean).join(' · ').replace(/;/g, ',');
        lines.push(`  ${it.date || ''};${desc};${fmt(it.amount)}`);
      }
      return lines;
    }),
    `Summe Ausgaben;${fmt(data.expenses.total)}`,
    '',
    `GEWINN VOR STEUERN;${fmt(data.profit)}`,
  ];

  const csv = '\uFEFF' + lines.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="EUER-${from.slice(0, 4)}-cam2rent.csv"`,
    },
  });
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}
