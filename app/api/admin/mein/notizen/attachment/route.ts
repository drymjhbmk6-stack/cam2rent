import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { detectFileType, type DetectedFileType } from '@/lib/file-type-check';

export const dynamic = 'force-dynamic';

const BUCKET = 'employee-note-attachments';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
// Pfad-Form: <admin_user_id>/<uuid>.<ext> — strikt, kein Path-Traversal.
const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

const EXT: Record<string, string> = {
  jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic', heif: 'heif', gif: 'gif',
  pdf: 'pdf', mp4: 'mp4', mov: 'mov', webm: 'webm',
};
const MIME: Record<string, string> = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
  heif: 'image/heif', gif: 'image/gif', pdf: 'application/pdf',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

function isMissingBucket(err: { message?: string } | null): boolean {
  if (!err) return false;
  return /bucket not found|not found|does not exist/i.test(err.message ?? '');
}

/** POST: Datei hochladen → { id, path, filename, mime, size } */
export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Datei zu groß (max. 50 MB).' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectFileType(buffer) as DetectedFileType | null;
  if (!detected || !EXT[detected]) {
    return NextResponse.json(
      { error: 'Dateityp nicht erlaubt. Erlaubt: Bilder, PDF, Videos.' },
      { status: 400 },
    );
  }

  const ext = EXT[detected];
  const mime = MIME[detected];
  const fileId = randomUUID();
  const path = `${me.id}/${fileId}.${ext}`;
  const filename = (file.name || `datei.${ext}`).slice(0, 200);

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });

  if (error) {
    if (isMissingBucket(error)) {
      return NextResponse.json(
        { error: 'Storage-Bucket "employee-note-attachments" fehlt — bitte im Supabase-Dashboard anlegen.' },
        { status: 503 },
      );
    }
    console.error('mein/notizen attachment upload error:', error);
    return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({
    attachment: { id: fileId, path, filename, mime, size: file.size },
  });
}

/**
 * GET ?path=... → Signed-URL-Redirect (5 Min).
 * Zugriff: eigene Datei (Pfad-Präfix = eigene User-ID) ODER der Pfad steckt in
 * einer mit mir geteilten Notiz.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!PATH_RE.test(path)) return NextResponse.json({ error: 'Pfad ungültig.' }, { status: 400 });

  const supabase = createServiceClient();
  const ownsByPrefix = path.startsWith(`${me.id}/`);
  if (!ownsByPrefix) {
    // Steckt der Pfad in einer Notiz (Anhang ODER Buch-Seite), die mir gehört
    // oder mit mir geteilt ist? Pages-Anhänge sind verschachtelt, daher
    // werden die Kandidaten geladen und in JS geprüft (Menge ist klein).
    let { data: notes, error } = await supabase
      .from('employee_notes')
      .select('attachments, pages')
      .or(`admin_user_id.eq.${me.id},shared_with.cs.{${me.id}}`);
    // Defensiv: pages-Spalte fehlt (Migration ausstehend) → nur attachments.
    if (error && /pages/i.test(error.message ?? '')) {
      ({ data: notes, error } = await supabase
        .from('employee_notes')
        .select('attachments')
        .or(`admin_user_id.eq.${me.id},shared_with.cs.{${me.id}}`) as unknown as { data: typeof notes; error: typeof error });
    }
    const pathInAtts = (atts: unknown): boolean =>
      Array.isArray(atts) && atts.some((a) => a && typeof a === 'object' && (a as { path?: string }).path === path);
    const found = (notes ?? []).some((n) => {
      const row = n as { attachments?: unknown; pages?: unknown };
      if (pathInAtts(row.attachments)) return true;
      return Array.isArray(row.pages) && row.pages.some((p) => pathInAtts((p as { attachments?: unknown })?.attachments));
    });
    if (!found) {
      return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
    }
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'URL nicht erzeugbar.' }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}

/** DELETE ?path=... — eigene Datei aus dem Storage entfernen (best-effort). */
export async function DELETE(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.id === 'legacy-env') return NextResponse.json({ error: 'Mitarbeiter-Konto erforderlich.' }, { status: 403 });

  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!PATH_RE.test(path)) return NextResponse.json({ error: 'Pfad ungültig.' }, { status: 400 });
  // Nur eigene Dateien löschen (Pfad-Präfix = eigene User-ID).
  if (!path.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  await supabase.storage.from(BUCKET).remove([path]);
  return NextResponse.json({ ok: true });
}
