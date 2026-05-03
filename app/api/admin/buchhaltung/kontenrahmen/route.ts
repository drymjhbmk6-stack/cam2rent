import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { loadKontenrahmen, invalidateKontenrahmenCache, type KontenrahmenMapping } from '@/lib/accounting/kontenrahmen';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const mapping = await loadKontenrahmen();
  return NextResponse.json({ mapping });
}

export async function PUT(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  let body: Partial<KontenrahmenMapping>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 });
  }

  // Defensive validation: alle Konto-Codes muessen Strings 3-5 Zeichen sein
  const validateCode = (code: unknown): boolean =>
    typeof code === 'string' && /^[0-9]{3,5}$/.test(code);

  const collectCodes = (obj: unknown): string[] => {
    if (typeof obj === 'string') return [obj];
    if (obj && typeof obj === 'object') {
      return Object.values(obj).flatMap(collectCodes);
    }
    return [];
  };

  const codes = collectCodes(body);
  for (const code of codes) {
    if (!validateCode(code)) {
      return NextResponse.json(
        { error: `Ungueltiger Konto-Code: ${code}. Erwartet: 3-5 Ziffern.` },
        { status: 400 }
      );
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'kontenrahmen_mapping', value: body }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateKontenrahmenCache();
  return NextResponse.json({ ok: true });
}
