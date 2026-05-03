import type { NextRequest } from 'next/server';

/**
 * Extrahiert und validiert die Loesch-Begruendung aus einem Request.
 *
 * Quellen (in Reihenfolge):
 *   1. Header X-Delete-Reason
 *   2. URL-Parameter ?reason=...
 *   3. Body { reason: '...' }  (nur falls JSON)
 *
 * Mindestens 10 Zeichen. Wird vom Aufrufer ins Audit-Log geschrieben,
 * sodass jeder Loeschvorgang an Buchhaltungs-relevanten Daten nachvollziehbar
 * ist (GoBD § 146 AO — auch im Soft-Lock-Modus heute schon Best Practice).
 *
 * Rueckgabe:
 *   { ok: true, reason } — Validierung bestanden
 *   { ok: false, error } — fehlt oder zu kurz
 */

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

export interface DeleteReasonResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

export async function requireDeleteReason(req: NextRequest): Promise<DeleteReasonResult> {
  // 1. Header
  let reason = req.headers.get('x-delete-reason')?.trim();

  // 2. URL-Parameter
  if (!reason) {
    reason = req.nextUrl.searchParams.get('reason')?.trim() || '';
  }

  // 3. Body (nur bei JSON)
  if (!reason) {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await req.clone().json();
        if (typeof body?.reason === 'string') {
          reason = body.reason.trim();
        }
      } catch {
        // ignore
      }
    }
  }

  if (!reason) {
    return {
      ok: false,
      error: `Loeschbegruendung erforderlich (Header X-Delete-Reason oder ?reason=... mit min. ${MIN_LENGTH} Zeichen)`,
    };
  }
  if (reason.length < MIN_LENGTH) {
    return {
      ok: false,
      error: `Loeschbegruendung muss mindestens ${MIN_LENGTH} Zeichen haben`,
    };
  }
  if (reason.length > MAX_LENGTH) {
    reason = reason.slice(0, MAX_LENGTH);
  }

  return { ok: true, reason };
}
