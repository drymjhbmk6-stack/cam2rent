import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/handover/[bookingId]
 *
 * Speichert das digitale Übergabeprotokoll als JSONB im `handover_data`-
 * Feld der Buchung. Erwartet:
 *   {
 *     location: string,
 *     condition: { tested: boolean, noDamage: boolean, photosTaken: boolean, otherNote?: string },
 *     items: Array<{ name: string, ok: boolean }>,
 *     signatures: {
 *       landlord: { dataUrl: string, name: string },
 *       renter:   { dataUrl: string, name: string },
 *     }
 *   }
 *
 * Der Server ergaenzt completedAt, signedAt und IP automatisch.
 *
 * GET /api/admin/handover/[bookingId]
 * Liefert die gespeicherten handover_data-Daten zurueck (oder null).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { bookingId } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('handover_data')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ handoverData: data?.handover_data ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookingId } = await params;

  let body: {
    location?: string;
    condition?: { tested?: boolean; noDamage?: boolean; photosTaken?: boolean; otherNote?: string };
    items?: Array<{ name?: string; ok?: boolean }>;
    signatures?: {
      landlord?: { dataUrl?: string; name?: string };
      renter?: { dataUrl?: string; name?: string };
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Validation — beide Signaturen + Namen sind Pflicht
  const landlordSig = body.signatures?.landlord?.dataUrl?.trim();
  const landlordName = body.signatures?.landlord?.name?.trim();
  const renterSig = body.signatures?.renter?.dataUrl?.trim();
  const renterName = body.signatures?.renter?.name?.trim();
  if (!landlordSig || !landlordName) {
    return NextResponse.json({ error: 'Vermieter-Signatur + Name erforderlich.' }, { status: 400 });
  }
  if (!renterSig || !renterName) {
    return NextResponse.json({ error: 'Mieter-Signatur + Name erforderlich.' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const now = new Date().toISOString();

  const handoverData = {
    completedAt: now,
    location: (body.location ?? '').toString().trim().slice(0, 200),
    condition: {
      tested: !!body.condition?.tested,
      noDamage: !!body.condition?.noDamage,
      photosTaken: !!body.condition?.photosTaken,
      otherNote: (body.condition?.otherNote ?? '').toString().trim().slice(0, 500) || undefined,
    },
    items: Array.isArray(body.items)
      ? body.items.slice(0, 100).map((it) => ({
          name: (it.name ?? '').toString().trim().slice(0, 200),
          ok: !!it.ok,
        }))
      : [],
    signatures: {
      landlord: {
        dataUrl: landlordSig,
        name: landlordName.slice(0, 120),
        signedAt: now,
        ip,
      },
      renter: {
        dataUrl: renterSig,
        name: renterName.slice(0, 120),
        signedAt: now,
        ip,
      },
    },
  };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('bookings')
    .update({ handover_data: handoverData })
    .eq('id', bookingId);

  if (error) {
    console.error('[handover/save] DB-Update fehlgeschlagen:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit-Log (Admin-User wird im Helper auto-resolved)
  try {
    await logAudit({
      action: 'booking.handover_completed',
      entityType: 'booking',
      entityId: bookingId,
      changes: {
        landlordName,
        renterName,
        location: handoverData.location || null,
      },
      request: req,
    });
  } catch {
    // non-critical
  }

  return NextResponse.json({ success: true, completedAt: now });
}
