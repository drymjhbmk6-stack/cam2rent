import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendDamageResolution, sendAdminDamageNotice } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { isAllowedImage, detectImageType } from '@/lib/file-type-check';
import { createAdminNotification } from '@/lib/admin-notifications';
import {
  uploadDamageDocument,
  buildEmailHistoryAttachment,
  loadCustomerVisibleFiles,
  type DamageAttachment,
} from '@/lib/damage-attachments';

// Magic-Byte-Resultat → Extension + MIME (analog zum Kunden-Pfad
// /api/damage-report). Der Client-MIME wird bewusst ignoriert.
const DETECTED_TO_EXT: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  heic: { ext: 'heic', mime: 'image/heic' },
  heif: { ext: 'heif', mime: 'image/heif' },
  gif: { ext: 'gif', mime: 'image/gif' },
};

/**
 * GET /api/admin/damage
 * Alle Schadensmeldungen laden (mit Buchungs-Info).
 * Optional: ?status=open|confirmed|resolved
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const status = req.nextUrl.searchParams.get('status');
    const bookingId = req.nextUrl.searchParams.get('booking_id');

    let query = supabase
      .from('damage_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && ['open', 'confirmed', 'resolved'].includes(status)) {
      query = query.eq('status', status);
    }
    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    // Buchungs-Details dazuladen
    const bookingIds = [...new Set((reports || []).map((r) => r.booking_id))];
    const bookingsMap: Record<string, {
      product_name: string;
      customer_name: string;
      customer_email: string;
      deposit: number;
      product_id: string;
      deposit_intent_id: string | null;
      deposit_status: string | null;
      price_haftung: number | null;
    }> = {};

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, product_name, product_id, customer_name, customer_email, deposit, deposit_intent_id, deposit_status, price_haftung')
        .in('id', bookingIds);

      if (bookings) {
        for (const b of bookings) {
          bookingsMap[b.id] = {
            product_name: b.product_name,
            customer_name: b.customer_name,
            customer_email: b.customer_email,
            deposit: b.deposit,
            product_id: b.product_id,
            deposit_intent_id: b.deposit_intent_id ?? null,
            deposit_status: b.deposit_status ?? null,
            price_haftung: b.price_haftung ?? null,
          };
        }
      }
    }

    const enriched = (reports || []).map((r) => ({
      ...r,
      booking: bookingsMap[r.booking_id] || null,
    }));

    return NextResponse.json({ reports: enriched });
  } catch (err) {
    console.error('GET /api/admin/damage error:', err);
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

/**
 * POST /api/admin/damage
 * Admin legt im Namen des Kunden eine Schadensmeldung an — spiegelt den
 * Kunden-Flow (/api/damage-report): Beschreibung + Fotos, booking-bezogen.
 * Wird auf /admin/schaeden (mit Buchungsauswahl) und in der
 * Buchungsdetailseite (Buchung vorausgewählt) genutzt.
 * Body (FormData):
 *   - bookingId: string
 *   - description: string
 *   - admin_notes?: string
 *   - photos?: File[] (max 5, je max 5 MB, nur Bilder)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const bookingId = (formData.get('bookingId') as string | null)?.trim() || '';
    const description = (formData.get('description') as string | null)?.trim() || '';
    const adminNotes = (formData.get('admin_notes') as string | null)?.trim() || '';
    const rawAmount = (formData.get('damage_amount') as string | null)?.trim() || '';
    const notifyCustomer = ['true', '1', 'on', 'yes'].includes(
      String(formData.get('notify_customer') ?? '').toLowerCase(),
    );
    let damageAmount: number | null = null;
    if (rawAmount) {
      const parsed = parseFloat(rawAmount.replace(',', '.'));
      if (!Number.isNaN(parsed) && parsed >= 0) damageAmount = parsed;
    }

    if (!bookingId || !description) {
      return NextResponse.json(
        { error: 'Buchung und Beschreibung sind erforderlich.' },
        { status: 400 },
      );
    }
    if (description.length > 2000) {
      return NextResponse.json(
        { error: 'Beschreibung darf maximal 2000 Zeichen lang sein.' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Buchung prüfen
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, product_name, customer_name, customer_email')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    // Kundensichtbar freigegebene Datei-Pfade (Fotos + Dokumente). Alles
    // andere bleibt rein intern.
    const visiblePaths: string[] = [];

    // Fotos hochladen — getrennt in intern (`photos`) und für den Kunden
    // freigegeben (`photos_shared`). Nur freigegebene landen in visiblePaths.
    const photoPaths: string[] = [];
    const uploadPhotos = async (field: string, shared: boolean) => {
      const files = (formData.getAll(field) as File[]).filter((p) => p instanceof File && p.size > 0);
      for (const photo of files) {
        if (photo.size > 5 * 1024 * 1024) {
          throw { status: 400, error: `Datei "${photo.name}" ist zu groß (max 5 MB).` };
        }
        const buffer = Buffer.from(await photo.arrayBuffer());
        if (!isAllowedImage(buffer)) {
          throw { status: 400, error: `Datei "${photo.name}" ist kein gültiges Bild (JPEG/PNG/WebP/HEIC/GIF erwartet).` };
        }
        const detected = detectImageType(buffer);
        const info = detected ? DETECTED_TO_EXT[detected] : undefined;
        const ext = info?.ext ?? 'jpg';
        const realMime = info?.mime ?? 'image/jpeg';
        const fileName = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('damage-photos')
          .upload(fileName, buffer, { contentType: realMime, upsert: false });
        if (uploadErr) {
          console.error('Admin damage photo upload error:', uploadErr);
          continue;
        }
        photoPaths.push(fileName);
        if (shared) visiblePaths.push(fileName);
      }
    };

    // Dokument-Anhänge (PDF/Bild) — ebenfalls intern (`documents`) vs.
    // freigegeben (`documents_shared`).
    const attachments: DamageAttachment[] = [];
    const uploadDocs = async (field: string, shared: boolean) => {
      const files = (formData.getAll(field) as File[]).filter((f) => f instanceof File && f.size > 0);
      for (const file of files) {
        const res = await uploadDamageDocument(supabase, bookingId, file);
        if ('error' in res) throw { status: 400, error: res.error };
        attachments.push(res);
        if (shared) visiblePaths.push(res.path);
      }
    };

    try {
      await uploadPhotos('photos', false);
      await uploadPhotos('photos_shared', true);
      if (photoPaths.length > 20) {
        return NextResponse.json({ error: 'Maximal 20 Fotos erlaubt.' }, { status: 400 });
      }
      await uploadDocs('documents', false);
      await uploadDocs('documents_shared', true);
    } catch (e) {
      const err = e as { status?: number; error?: string };
      if (err?.error) return NextResponse.json({ error: err.error }, { status: err.status ?? 400 });
      throw e;
    }

    // Optional: E-Mail-Verlauf der Buchung als PDF anhängen.
    const attachEmailHistory = ['true', '1', 'on', 'yes'].includes(
      String(formData.get('attach_email_history') ?? '').toLowerCase(),
    );
    const emailHistoryShared = ['true', '1', 'on', 'yes'].includes(
      String(formData.get('email_history_shared') ?? '').toLowerCase(),
    );
    if (attachEmailHistory) {
      const mv = await buildEmailHistoryAttachment(supabase, bookingId, booking.customer_name || '');
      if (mv) {
        attachments.push(mv);
        if (emailHistoryShared) visiblePaths.push(mv.path);
      }
    }

    // Insert — defensiver Fallback ohne die neuen Spalten (Migration ausstehend).
    const baseRow = {
      booking_id: bookingId,
      reported_by: 'admin',
      description,
      photos: photoPaths,
      admin_notes: adminNotes || null,
      damage_amount: damageAmount,
      status: 'open',
    };
    let { data: report, error: insertErr } = await supabase
      .from('damage_reports')
      .insert({ ...baseRow, attachments, customer_visible_paths: visiblePaths })
      .select('id')
      .single();
    if (insertErr && /attachments|customer_visible_paths|column|schema cache|PGRST/i.test(insertErr.message)) {
      ({ data: report, error: insertErr } = await supabase
        .from('damage_reports')
        .insert(baseRow)
        .select('id')
        .single());
    }

    if (insertErr || !report) {
      console.error('Admin insert damage_report error:', insertErr);
      return NextResponse.json(
        { error: 'Schadensmeldung konnte nicht erstellt werden.' },
        { status: 500 },
      );
    }

    // Interne Info-Notification
    createAdminNotification(supabase, {
      type: 'new_damage',
      title: 'Schadensmeldung erfasst (Admin)',
      message: `${booking.customer_name || '–'} — ${booking.product_name || '–'}`,
      link: '/admin/schaeden',
    });

    // Optional: Kunden per E-Mail informieren (Checkbox im Formular)
    let emailSent = false;
    let emailError: string | null = null;
    if (notifyCustomer) {
      if (!booking.customer_email) {
        emailError = 'Keine E-Mail-Adresse bei der Buchung hinterlegt.';
      } else {
        try {
          // Nur die pro Datei freigegebenen Fotos/Anhänge an den Kunden.
          const files = visiblePaths.length
            ? await loadCustomerVisibleFiles(supabase, { photos: photoPaths, attachments, visiblePaths })
            : [];
          await sendAdminDamageNotice(
            {
              bookingId,
              customerName: booking.customer_name || '',
              customerEmail: booking.customer_email,
              productName: booking.product_name || '',
              description,
              photoCount: files.length,
            },
            files.length ? { attachments: files } : undefined,
          );
          emailSent = true;
        } catch (e) {
          console.error('Admin damage notice email error:', e);
          emailError = 'E-Mail konnte nicht gesendet werden.';
        }
      }
    }

    await logAudit({
      action: 'damage.create',
      entityType: 'damage',
      entityId: report.id,
      changes: { booking_id: bookingId, photos: photoPaths.length, reported_by: 'admin', customer_notified: emailSent },
      request: req,
    });

    return NextResponse.json({ success: true, reportId: report.id, emailSent, emailError });
  } catch (err) {
    console.error('POST /api/admin/damage error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen der Schadensmeldung.' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/damage
 * Schadensmeldung aktualisieren.
 * Body: { reportId, status?, damage_amount?, deposit_retained?, admin_notes?, repair_until?, notify_customer? }
 * notify_customer: die Schadensabschluss-Mail geht NUR raus, wenn dieses Flag
 * explizit true ist (bewusste Admin-Entscheidung, kein Auto-Versand).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportId, status, damage_amount, deposit_retained, admin_notes, resolution_note, repair_until } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'reportId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Report laden
    const { data: report, error: fetchErr } = await supabase
      .from('damage_reports')
      .select('*, booking_id')
      .eq('id', reportId)
      .single();

    if (fetchErr || !report) {
      return NextResponse.json({ error: 'Schadensmeldung nicht gefunden.' }, { status: 404 });
    }

    // Update-Objekt bauen
    const updates: Record<string, unknown> = {};
    if (status && ['open', 'confirmed', 'resolved'].includes(status)) {
      updates.status = status;
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (damage_amount !== undefined) updates.damage_amount = damage_amount;
    if (deposit_retained !== undefined) updates.deposit_retained = deposit_retained;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (resolution_note !== undefined) updates.resolution_note = resolution_note;

    let { error: updateErr } = await supabase
      .from('damage_reports')
      .update(updates)
      .eq('id', reportId);
    // Defensiver Fallback, falls die resolution_note-Migration noch fehlt.
    if (updateErr && /resolution_note|column|schema cache|PGRST/i.test(updateErr.message)) {
      const { resolution_note: _drop, ...rest } = updates;
      void _drop;
      ({ error: updateErr } = await supabase.from('damage_reports').update(rest).eq('id', reportId));
    }

    if (updateErr) throw updateErr;

    // Bei "damaged" Status → Buchung aktualisieren
    if (status === 'confirmed') {
      const bookingUpdates: Record<string, unknown> = { status: 'damaged' };
      if (repair_until) {
        bookingUpdates.repair_until = repair_until;
      }
      await supabase
        .from('bookings')
        .update(bookingUpdates)
        .eq('id', report.booking_id);
    }

    // Bei "resolved" → Kunde IMMER benachrichtigen (Abschluss-Mail geht
    // automatisch raus, sobald eine Kunden-E-Mail hinterlegt ist).
    if (status === 'resolved') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_name, customer_email, product_name')
        .eq('id', report.booking_id)
        .single();

      if (booking?.customer_email) {
        sendDamageResolution({
          bookingId: report.booking_id,
          customerName: booking.customer_name || '',
          customerEmail: booking.customer_email,
          productName: booking.product_name || '',
          damageAmount: damage_amount ?? report.damage_amount ?? 0,
          depositRetained: deposit_retained ?? report.deposit_retained ?? 0,
          // NUR der kundensichtbare Abschlusstext — die internen Admin-Notizen
          // gehen bewusst NICHT an den Kunden.
          adminNotes: resolution_note ?? report.resolution_note ?? '',
        }).catch((e) => console.error('Damage resolution email error:', e));
      }
    }

    const auditAction = status === 'resolved'
      ? 'damage.resolve'
      : status === 'confirmed'
        ? 'damage.confirm'
        : 'damage.update';

    await logAudit({
      action: auditAction,
      entityType: 'damage',
      entityId: reportId,
      changes: updates,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/damage error:', err);
    return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
  }
}
