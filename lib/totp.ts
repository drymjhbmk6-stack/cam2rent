import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

const ISSUER = 'cam2rent Admin';
const PERIOD = 30;
const DIGITS = 6;

/**
 * Generiert ein neues TOTP-Secret mit otpauth-URL.
 */
export function generateSecret(label: string = 'Admin') {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
  });

  return {
    secret: totp.secret.base32,
    otpauthUrl: totp.toString(),
  };
}

/**
 * Prüft einen 6-stelligen TOTP-Code gegen ein Secret.
 * Window=1 erlaubt ±30s für Clock-Drift.
 */
export function verifyToken(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Generiert einen QR-Code als Data-URL (base64 PNG).
 */
export async function generateQRDataURL(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
