import { NextResponse } from 'next/server';
import { generateSecret, generateQRDataURL } from '@/lib/totp';

/**
 * POST /api/admin/2fa/setup
 * Generiert ein neues TOTP-Secret und QR-Code.
 * Secret wird NOCH NICHT gespeichert — erst nach Bestätigung.
 */
export async function POST() {
  try {
    const { secret, otpauthUrl } = generateSecret();
    const qrDataUrl = await generateQRDataURL(otpauthUrl);

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen.' }, { status: 500 });
  }
}
