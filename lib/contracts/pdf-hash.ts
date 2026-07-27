import { createHash } from 'crypto';

/**
 * SHA-256-Hash der PDF-Bytes (Hex). Dient als Integritätsnachweis des
 * gespeicherten Vertrags-Originals: beim Ausliefern wird der Hash der geladenen
 * Datei gegen den bei Vertragsschluss gespeicherten Wert verglichen. Eine
 * Abweichung deutet auf Manipulation/Beschädigung im Storage hin.
 *
 * Wichtig: Dies ist ein Hash der DATEI-Bytes — unabhängig vom `contract_hash`
 * in rental_agreements, der den logischen Vertragstext + die Signaturdaten
 * bindet (contract-template `buildContractText`).
 */
export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
