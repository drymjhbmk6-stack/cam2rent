import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/custom-sets?userId=...
 * Gibt alle gespeicherten eigenen Sets eines Users zurück.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId fehlt.' }, { status: 400 });

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
 * POST /api/custom-sets
 * Speichert ein eigenes Set.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, cameraId, accessoryIds, name } = body as {
      userId: string;
      cameraId: string;
      accessoryIds: string[];
      name?: string;
    };

    if (!userId || !cameraId) {
      return NextResponse.json({ error: 'userId und cameraId erforderlich.' }, { status: 400 });
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
 * DELETE /api/custom-sets
 * Löscht ein eigenes Set.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { id, userId } = await req.json() as { id: string; userId: string };
    if (!id || !userId) {
      return NextResponse.json({ error: 'id und userId fehlen.' }, { status: 400 });
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
