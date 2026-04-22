import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getEnvMode, setEnvMode, type EnvMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const ok = await checkAdminAuth();
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const mode = await getEnvMode();
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const ok = await checkAdminAuth();
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { mode?: string; password?: string } | null;
  if (!body || (body.mode !== 'test' && body.mode !== 'live')) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
  }
  const password = body.password ?? '';
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) {
    return NextResponse.json({ error: 'admin password not configured' }, { status: 500 });
  }
  const a = createHash('sha256').update(password).digest();
  const b = createHash('sha256').update(expected).digest();
  let passwordOk = false;
  try {
    passwordOk = timingSafeEqual(a, b);
  } catch {
    passwordOk = false;
  }
  if (!passwordOk) {
    return NextResponse.json({ error: 'wrong password' }, { status: 403 });
  }

  const previous = await getEnvMode();
  const target = body.mode as EnvMode;
  await setEnvMode(target);

  await logAudit({
    action: 'env_mode.change',
    entityType: 'env_mode',
    entityId: 'environment_mode',
    entityLabel: `${previous} → ${target}`,
    changes: { from: previous, to: target },
    request: req,
  });

  return NextResponse.json({ ok: true, mode: target });
}
