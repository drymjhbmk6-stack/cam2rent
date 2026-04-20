import { z } from 'zod';

/**
 * Zod-Schemas für kritische API-Bodies.
 *
 * Bisher wurden Request-Bodies per TypeScript `as`-Cast "validiert" — das ist
 * aber keine Laufzeit-Validierung. Die Schemas hier stellen sicher, dass die
 * tatsächlich eingehenden Daten den erwarteten Typen entsprechen.
 *
 * Verwendung:
 *   const parsed = confirmBookingBodySchema.safeParse(body);
 *   if (!parsed.success) return NextResponse.json({ error: 'Ungültig.' }, { status: 400 });
 *   const { payment_intent_id } = parsed.data;
 */

const stripeIdPattern = /^pi_[A-Za-z0-9_]+$/;

// Begrenzung von String-Feldern gegen DoS-artiges Füllen.
const nameField = z.string().trim().min(1).max(200);
const emailField = z.string().trim().email().max(254);

const contractSignatureSchema = z
  .object({
    signatureDataUrl: z.string().max(500_000).nullable(),
    signatureMethod: z.enum(['canvas', 'typed']),
    signerName: nameField,
    agreedToTerms: z.boolean(),
  })
  .strict();

export const confirmBookingBodySchema = z
  .object({
    payment_intent_id: z.string().regex(stripeIdPattern).max(200),
    deposit_intent_id: z.string().regex(stripeIdPattern).max(200).optional(),
    contractSignature: contractSignatureSchema.optional(),
  })
  .strict();

export type ConfirmBookingBody = z.infer<typeof confirmBookingBodySchema>;

// Validate-Coupon: Code ist ein alphanumerischer String mit begrenzter Länge.
export const validateCouponBodySchema = z
  .object({
    code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9\-_]+$/),
    cartTotal: z.number().finite().nonnegative().max(1_000_000).optional(),
    userEmail: z.string().trim().max(254).optional(),
  })
  .strict();

// Survey: rating 1-5, Feedback begrenzt, Email optional.
export const surveyBodySchema = z
  .object({
    bookingId: z.string().trim().min(1).max(64),
    rating: z.number().int().min(1).max(5),
    feedback: z.string().max(5_000).optional(),
    email: emailField.optional(),
  })
  .strict();

/**
 * Helper: Wandelt ZodError in eine kompakte Fehler-Message um. Gibt dem
 * Client einen generischen Text, ohne die genaue Zod-Meldung zu leaken.
 */
export function firstZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Ungültige Anfrage.';
  // Nur Pfad zeigen — die internen Zod-Messages verraten Schema-Details.
  return `Ungültiges Feld: ${issue.path.join('.') || '(root)'}`;
}
