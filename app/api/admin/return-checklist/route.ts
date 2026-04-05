import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { cookies } from 'next/headers';

/**
 * GET /api/admin/return-checklist?bookingId=BK-2026-00001
 * Returns the checklist for a booking, or creates one from template if none exists.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  if (!cookieStore.get('admin_session')?.value) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const bookingId = req.nextUrl.searchParams.get('bookingId');
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check if checklist exists
  const { data: existing } = await supabase
    .from('return_checklists')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ checklist: existing });
  }

  // Load template and create new checklist
  const { data: templateRow } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'return_checklist_template')
    .maybeSingle();

  const template = (templateRow?.value as Array<{ label: string; required: boolean }>) ?? [
    { label: 'Paket erhalten', required: true },
    { label: 'Kamera vorhanden und vollständig', required: true },
    { label: 'Zubehör vollständig', required: true },
    { label: 'Optische Prüfung: Keine Schäden sichtbar', required: true },
    { label: 'Funktionsprüfung: Kamera funktioniert', required: true },
    { label: 'SD-Karte geleert / entfernt', required: false },
    { label: 'Gereinigt und einsatzbereit', required: false },
  ];

  const items = template.map((t) => ({
    label: t.label,
    required: t.required,
    checked: false,
    comment: '',
    photos: [],
  }));

  const { data: newChecklist, error } = await supabase
    .from('return_checklists')
    .insert({ booking_id: bookingId, items, status: 'in_progress' })
    .select()
    .single();

  if (error) {
    console.error('Create checklist error:', error);
    return NextResponse.json({ error: 'Checkliste konnte nicht erstellt werden.' }, { status: 500 });
  }

  return NextResponse.json({ checklist: newChecklist });
}

/**
 * PATCH /api/admin/return-checklist
 * Body: { bookingId, items, status? }
 * Updates the checklist items and optionally completes it.
 */
export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  if (!cookieStore.get('admin_session')?.value) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { bookingId, items, status } = await req.json();
  if (!bookingId || !items) {
    return NextResponse.json({ error: 'bookingId und items erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updateData: Record<string, unknown> = { items };

  if (status === 'completed') {
    // Verify all required items are checked
    const allRequiredChecked = items.every(
      (item: { required: boolean; checked: boolean }) => !item.required || item.checked
    );
    if (!allRequiredChecked) {
      return NextResponse.json({ error: 'Nicht alle Pflichtfelder abgehakt.' }, { status: 400 });
    }
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();

    // Mark booking as completed
    await supabase
      .from('bookings')
      .update({ status: 'completed' })
      .eq('id', bookingId);
  } else if (status === 'damage_reported') {
    updateData.status = 'damage_reported';
  } else {
    updateData.status = 'in_progress';
  }

  const { error } = await supabase
    .from('return_checklists')
    .update(updateData)
    .eq('booking_id', bookingId);

  if (error) {
    console.error('Update checklist error:', error);
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
