import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET  /api/admin/suppliers  → alle Lieferanten
 * POST /api/admin/suppliers  → neuen Lieferanten anlegen
 */

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, contact_person, email, phone, website, supplier_number, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: name.trim(),
      contact_person: contact_person?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      supplier_number: supplier_number?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data }, { status: 201 });
}
