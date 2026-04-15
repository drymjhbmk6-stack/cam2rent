import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';

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
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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
    `Mieterlöse;${fmt(data.income.rental)}`,
    `Haftungsschutz;${fmt(data.income.haftung)}`,
    `Versandkostenpauschalen;${fmt(data.income.shipping)}`,
    `Sonstige Einnahmen;${fmt(data.income.other)}`,
    `Summe Einnahmen;${fmt(data.income.total)}`,
    '',
    'AUSGABEN',
    ...(data.expenses.categories || []).map((c: { label: string; amount: number }) => `${c.label};${fmt(c.amount)}`),
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
