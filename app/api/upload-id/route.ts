import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isAllowedImage } from '@/lib/file-type-check';

const uploadLimiter = rateLimit({ maxAttempts: 5, windowMs: 60 * 60 * 1000 }); // 5 pro Stunde

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/upload-id
 * Kunde lädt Personalausweis hoch (Vorderseite + Rückseite).
 * FormData: front (File), back (File)
 * Auth: Supabase-Session aus Authorization-Header
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = uploadLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte versuche es später.' }, { status: 429 });
  }

  try {
    // Auth prüfen — User-ID aus Authorization-Header (Bearer token)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const userId = user.id;

    // Service client für Storage + DB
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const formData = await req.formData();
    const front = formData.get('front') as File | null;
    const back = formData.get('back') as File | null;

    if (!front || !back) {
      return NextResponse.json(
        { error: 'Bitte lade Vorder- und Rückseite hoch.' },
        { status: 400 }
      );
    }

    // Validierung
    for (const [label, file] of [['Vorderseite', front], ['Rückseite', back]] as const) {
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: `${label} fehlt.` }, { status: 400 });
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `${label} ist zu groß (max 5 MB).` }, { status: 400 });
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `${label}: Nur JPG, PNG oder WebP erlaubt.` },
          { status: 400 }
        );
      }
    }

    // Upload
    const uploads: { side: string; file: File }[] = [
      { side: 'front', file: front },
      { side: 'back', file: back },
    ];

    const storagePaths: Record<string, string> = {};

    for (const { side, file } of uploads) {
      // Extension AUS dem MIME-Type ableiten (nicht aus file.name — sonst
      // Path-Traversal möglich, z.B. file.name = "../../etc/passwd").
      const ext = MIME_TO_EXT[file.type] ?? 'jpg';
      const filePath = `${userId}/${side}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      // Magic-Byte-Check: vom Client gemeldeter MIME reicht nicht.
      if (!isAllowedImage(buffer)) {
        return NextResponse.json(
          {
            error: `${side === 'front' ? 'Vorderseite' : 'Rückseite'}: Datei ist kein gültiges Bild (JPG, PNG, WebP oder HEIC).`,
          },
          { status: 400 },
        );
      }

      const { error: uploadErr } = await supabase.storage
        .from('id-documents')
        .upload(filePath, buffer, {
          contentType: file.type || 'image/jpeg',
          upsert: true, // Überschreiben bei erneutem Upload
        });

      if (uploadErr) {
        console.error(`ID document upload error (${side}):`, uploadErr);
        return NextResponse.json(
          { error: `Fehler beim Hochladen der ${side === 'front' ? 'Vorderseite' : 'Rückseite'}.` },
          { status: 500 }
        );
      }

      storagePaths[side] = filePath;
    }

    // Profil aktualisieren
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        id_front_url: storagePaths.front,
        id_back_url: storagePaths.back,
        verification_status: 'pending',
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('Profile update error:', updateErr);
      return NextResponse.json(
        { error: 'Profil konnte nicht aktualisiert werden.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('POST /api/upload-id error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Hochladen der Dokumente.' },
      { status: 500 }
    );
  }
}
