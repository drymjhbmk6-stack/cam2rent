import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/customer-notes?customerId=xxx
 * Notizen für einen Kunden laden.
 */
export async function GET(req: NextRequest) {
  try {
    const customerId = req.nextUrl.searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: notes, error } = await supabase
      .from('admin_customer_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Notes fetch error:', error);
      return NextResponse.json({ notes: [] });
    }

    return NextResponse.json({ notes: notes || [] });
  } catch (err) {
    console.error('GET /api/admin/customer-notes error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

/**
 * POST /api/admin/customer-notes
 * Neue Notiz erstellen.
 * Body: { customerId, content }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, content } = body;

    if (!customerId || !content?.trim()) {
      return NextResponse.json({ error: 'customerId und content erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: note, error } = await supabase
      .from('admin_customer_notes')
      .insert({ customer_id: customerId, content: content.trim() })
      .select()
      .single();

    if (error) {
      console.error('Note insert error:', error);
      return NextResponse.json({ error: 'Fehler beim Speichern.' }, { status: 500 });
    }

    return NextResponse.json({ note });
  } catch (err) {
    console.error('POST /api/admin/customer-notes error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
