import { NextResponse } from 'next/server';
import { generateSecret, generateQRDataURL } from '@/lib/totp';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/2fa/setup
 * Generiert ein neues TOTP-Secret und QR-Code.
 * Secret wird NOCH NICHT gespeichert — erst nach Bestätigung.
 *
 * NUR fuer eingeloggte Admins — sonst koennte ein Anonymer das Setup
 * starten und in confirm/disable das gespeicherte Secret ueberschreiben.
 */
export async function POST() {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { secret, otpauthUrl } = generateSecret();
    const qrDataUrl = await generateQRDataURL(otpauthUrl);

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen.' }, { status: 500 });
  }
}
