import { NextRequest, NextResponse } from 'next/server';
import { loadWbwConfig, saveWbwConfig } from '@/lib/inventar/wiederbeschaffungswert';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const cfg = await loadWbwConfig();
  return NextResponse.json({ config: cfg });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { floor_percent?: number; useful_life_months?: number } | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const floor = Number(body.floor_percent ?? 40);
  const ulm = Math.round(Number(body.useful_life_months ?? 36));
  if (floor < 0 || floor > 100) return NextResponse.json({ error: 'floor_percent muss 0..100 sein' }, { status: 400 });
  if (ulm < 1) return NextResponse.json({ error: 'useful_life_months muss >= 1 sein' }, { status: 400 });

  await saveWbwConfig({ floor_percent: floor, useful_life_months: ulm });
  await logAudit({ action: 'wbw_config.update', entityType: 'admin_settings', changes: { floor_percent: floor, useful_life_months: ulm }, request: req });
  return NextResponse.json({ config: { floor_percent: floor, useful_life_months: ulm } });
}
