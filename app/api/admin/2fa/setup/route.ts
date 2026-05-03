import { NextResponse } from 'next/server';
import { generateSecret, generateQRDataURL } from '@/lib/totp';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/2fa/setup
 * Generiert ein neues TOTP-Secret und QR-Code.
 * Secret wird NOCH NICHT gespeichert — erst nach Bestätigung.
 *
 * Owner-only (Sweep 7 Vuln 2): Das TOTP-Secret schuetzt ausschliesslich den
 * Legacy-ENV-Notfall-Login. Mitarbeiter haben hier nichts zu suchen — sie
 * koennten sonst eigene Secrets persistieren oder das bestehende Secret
 * ueberschreiben/loeschen und damit den Owner aussperren.
 */
export async function POST() {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Nur Owner dürfen 2FA verwalten.' }, { status: 403 });
    }

    const { secret, otpauthUrl } = generateSecret();
    const qrDataUrl = await generateQRDataURL(otpauthUrl);

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen.' }, { status: 500 });
  }
}
