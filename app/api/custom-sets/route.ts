import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Sweep 8 H2: User-ID kommt jetzt nur aus der Supabase-Session.
 * Vorher: userId aus Query/Body — IDOR. Angreifer mit Opfer-UUID konnte
 * fremde Konfigurationen lesen, anlegen, loeschen.
 */
async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user?.id ?? null;
}

/**
 * GET /api/custom-sets — User aus Session.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('custom_sets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ sets: data ?? [] });
  } catch (err) {
    console.error('GET /api/custom-sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

/**
 * POST /api/custom-sets — User aus Session, Body-userId ignoriert.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

  try {
    const body = await req.json();
    const { cameraId, accessoryIds, name } = body as {
      cameraId: string;
      accessoryIds: string[];
      name?: string;
    };

    if (!cameraId) {
      return NextResponse.json({ error: 'cameraId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('custom_sets')
      .insert({
        user_id: userId,
        camera_id: cameraId,
        accessory_ids: accessoryIds ?? [],
        name: name?.trim() || 'Eigenes Set',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ set: data });
  } catch (err) {
    console.error('POST /api/custom-sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Speichern.' }, { status: 500 });
  }
}

/**
 * DELETE /api/custom-sets — User aus Session, Body-userId ignoriert.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

  try {
    const { id } = await req.json() as { id: string };
    if (!id) {
      return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('custom_sets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/custom-sets error:', err);
    return NextResponse.json({ error: 'Fehler beim Löschen.' }, { status: 500 });
  }
}
