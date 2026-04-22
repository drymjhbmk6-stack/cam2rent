import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/kunden/blacklist
 * Sperrt oder entsperrt einen Kunden.
 * Body: { userId: string, blacklisted: boolean, reason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, blacklisted, reason } = (await req.json()) as {
      userId: string;
      blacklisted: boolean;
      reason?: string;
    };

    if (!userId || typeof blacklisted !== 'boolean') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const updateData: Record<string, unknown> = {
      blacklisted,
    };

    if (blacklisted) {
      updateData.blacklist_reason = reason || '';
      updateData.blacklisted_at = new Date().toISOString();
    } else {
      updateData.blacklist_reason = null;
      updateData.blacklisted_at = null;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('Blacklist update error:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    await logAudit({
      action: blacklisted ? 'customer.block' : 'customer.unblock',
      entityType: 'customer',
      entityId: userId,
      changes: blacklisted ? { reason } : undefined,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/kunden/blacklist error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
