/**
 * Vollstaendige Loeschung eines Kundenkontos (DSGVO Art. 17 — "Recht auf
 * Vergessenwerden"), ausgeloest durch eine Loeschanfrage des Kunden.
 *
 * Unterschied zur reinen Anonymisierung (`lib/anonymize-customer.ts`):
 * Dort bleibt die Profil-Zeile als "Geloeschter Kunde" bestehen. Hier wird das
 * Konto restlos entfernt — Profil weg, alle konto-gebundenen Nebendaten weg,
 * Ausweis-/UGC-/Anhang-Dateien weg, E-Mail wieder frei.
 *
 * ZWEI MODI (der Server entscheidet automatisch):
 *
 *  - mode 'full'      → Der Kunde hat KEINE Buchungen. Der Auth-User wird hart
 *                       geloescht (`auth.admin.deleteUser`). Es bleibt nichts.
 *
 *  - mode 'retained'  → Der Kunde HAT Buchungen. Ein Hard-Delete scheitert am
 *                       Foreign-Key `bookings.user_id`, und die Buchungs-/
 *                       Rechnungsdaten unterliegen ohnehin der gesetzlichen
 *                       Aufbewahrungspflicht (§ 147 AO / § 257 HGB, 10 Jahre —
 *                       Art. 17 Abs. 3 lit. b DSGVO). Deshalb: Auth-Konto wird
 *                       gebannt + die E-Mail auf eine geparkte Adresse
 *                       umbenannt (Originaladresse ist danach wieder frei),
 *                       E-Mail-Logs + Audit-Details werden gescrubbt, das
 *                       Profil wird geloescht. Die Buchungen selbst bleiben
 *                       mit ihren Rechnungsdaten stehen.
 *
 * In BEIDEN Faellen wird alles geloescht, was nicht aufbewahrungspflichtig ist:
 * Favoriten, eigene Sets, Warenkorb-Holds, Reservierungen, Login-Verlauf,
 * Push-Abos, Nachrichten inkl. Anhaenge, Bewertungen, Kundenmaterial (UGC),
 * Ausweis-Scans, Newsletter-/Warteliste-/Feedback-Eintraege, Admin-Notizen.
 *
 * Die Funktion enthaelt bewusst KEINE Auth-/Guard-/Audit-Schritte — die bleiben
 * beim Aufrufer (`/api/admin/kunden/delete` prueft Owner + aktive Buchungen +
 * schreibt das Loeschprotokoll).
 */

import type { createServiceClient } from '@/lib/supabase';
import { anonymizeCustomerCore } from '@/lib/anonymize-customer';

type SB = ReturnType<typeof createServiceClient>;

export type DeleteCustomerMode = 'full' | 'retained';

export type DeleteCustomerResult = {
  ok: boolean;
  mode: DeleteCustomerMode;
  bookingCount: number;
  email: string | null;
  /** Pro Tabelle die Anzahl geloeschter Zeilen (best effort). */
  removed: Record<string, number>;
  /** Nicht-blockierende Probleme (fehlende Tabelle, Storage-Fehler, ...). */
  warnings: string[];
  error?: string;
};

/** Tabellen, die direkt ueber die User-ID am Konto haengen. */
const USER_ID_TABLES = [
  'favorites',
  'custom_sets',
  'cart_holds',
  'reservations',
  'customer_login_history',
  'customer_push_subscriptions',
  'customer_ugc_submissions',
  'abandoned_carts',
  'reviews',
] as const;

/** Tabellen, die den Kunden nur ueber seine E-Mail-Adresse kennen. */
const EMAIL_TABLES: { table: string; column: string }[] = [
  { table: 'newsletter_subscribers', column: 'email' },
  { table: 'waitlist_subscriptions', column: 'email' },
  { table: 'beta_feedback', column: 'tester_email' },
  { table: 'referrals', column: 'referred_email' },
];

function isMissingTable(msg: string): boolean {
  return /does not exist|42P01|PGRST205|schema cache/i.test(msg);
}

export async function deleteCustomerCore(
  supabase: SB,
  customerId: string,
): Promise<DeleteCustomerResult> {
  const removed: Record<string, number> = {};
  const warnings: string[] = [];

  // ── 0) Original-E-Mail + Buchungszahl ermitteln (VOR jeder Mutation) ──────
  let email: string | null = null;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(customerId);
    email = authUser?.user?.email ?? null;
  } catch (e) {
    warnings.push('Auth-Konto nicht lesbar: ' + String(e));
  }

  const { data: bookingRows, error: bookingErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', customerId);
  if (bookingErr) {
    return {
      ok: false, mode: 'retained', bookingCount: 0, email, removed, warnings,
      error: 'Buchungen konnten nicht geprüft werden: ' + bookingErr.message,
    };
  }
  const bookingCount = bookingRows?.length ?? 0;
  const mode: DeleteCustomerMode = bookingCount === 0 ? 'full' : 'retained';

  // ── 1) Ausweis-Scans aus dem Storage ─────────────────────────────────────
  try {
    const { data: idFiles } = await supabase.storage.from('id-documents').list(customerId);
    if (idFiles?.length) {
      await supabase.storage
        .from('id-documents')
        .remove(idFiles.map((f) => `${customerId}/${f.name}`));
      removed['ausweis_dateien'] = idFiles.length;
    }
  } catch (e) {
    warnings.push('Ausweis-Dateien: ' + String(e));
  }

  // ── 2) Kundenmaterial (UGC) aus dem Storage ──────────────────────────────
  try {
    const { data: ugcRows } = await supabase
      .from('customer_ugc_submissions')
      .select('file_paths')
      .eq('user_id', customerId);
    let ugcFiles = 0;
    for (const ugc of ugcRows ?? []) {
      const paths = ((ugc as { file_paths?: string[] }).file_paths ?? []) as string[];
      if (paths.length > 0) {
        await supabase.storage.from('customer-ugc').remove(paths);
        ugcFiles += paths.length;
      }
    }
    if (ugcFiles) removed['ugc_dateien'] = ugcFiles;
  } catch (e) {
    warnings.push('Kundenmaterial-Dateien: ' + String(e));
  }

  // ── 3) Nachrichten-Konversationen inkl. Anhaengen ────────────────────────
  //     conversations → messages → message_attachments (Storage + Zeilen).
  try {
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId);

    if (convErr) {
      if (!isMissingTable(convErr.message)) warnings.push('Konversationen: ' + convErr.message);
    } else if (convs?.length) {
      const convIds = convs.map((c) => c.id as string);

      // Anhang-Dateien der zugehoerigen Nachrichten aufraeumen
      try {
        const { data: msgs } = await supabase
          .from('messages')
          .select('id')
          .in('conversation_id', convIds);
        const msgIds = (msgs ?? []).map((m) => m.id as string);
        if (msgIds.length > 0) {
          const { data: atts } = await supabase
            .from('message_attachments')
            .select('storage_path')
            .in('message_id', msgIds);
          const paths = (atts ?? [])
            .map((a) => (a as { storage_path?: string }).storage_path)
            .filter((p): p is string => !!p);
          if (paths.length > 0) {
            await supabase.storage.from('email-attachments').remove(paths);
            removed['nachrichten_anhaenge'] = paths.length;
          }
        }
      } catch (e) {
        warnings.push('Nachrichten-Anhänge: ' + String(e));
      }

      // messages/message_attachments haengen per ON DELETE CASCADE an
      // conversations — ein Delete auf die Konversationen genuegt.
      const { data: delConv } = await supabase
        .from('conversations')
        .delete()
        .in('id', convIds)
        .select('id');
      removed['nachrichten_konversationen'] = delConv?.length ?? convIds.length;
    }
  } catch (e) {
    warnings.push('Nachrichten: ' + String(e));
  }

  // ── 4) Konto-gebundene Tabellen (user_id) ────────────────────────────────
  for (const table of USER_ID_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', customerId)
        .select('id');
      if (error) {
        if (!isMissingTable(error.message)) warnings.push(`${table}: ${error.message}`);
        continue;
      }
      if (data?.length) removed[table] = data.length;
    } catch (e) {
      warnings.push(`${table}: ${String(e)}`);
    }
  }

  // ── 5) Admin-Notizen zum Kunden (customer_id) ────────────────────────────
  try {
    const { data, error } = await supabase
      .from('admin_customer_notes')
      .delete()
      .eq('customer_id', customerId)
      .select('id');
    if (error && !isMissingTable(error.message)) {
      warnings.push('admin_customer_notes: ' + error.message);
    } else if (data?.length) {
      removed['admin_customer_notes'] = data.length;
    }
  } catch (e) {
    warnings.push('admin_customer_notes: ' + String(e));
  }

  // ── 5b) Empfehlungen, bei denen der Kunde der Werber war ─────────────────
  try {
    const { data, error } = await supabase
      .from('referrals')
      .delete()
      .eq('referrer_user_id', customerId)
      .select('id');
    if (error) {
      if (!isMissingTable(error.message)) warnings.push('referrals (Werber): ' + error.message);
    } else if (data?.length) {
      removed['referrals'] = (removed['referrals'] ?? 0) + data.length;
    }
  } catch (e) {
    warnings.push('referrals (Werber): ' + String(e));
  }

  // ── 6) Frontend-Fehlerprotokoll entkoppeln (user_id → NULL) ──────────────
  try {
    await supabase.from('client_errors').update({ user_id: null }).eq('user_id', customerId);
  } catch { /* best effort */ }

  // ── 7) E-Mail-basierte Eintraege (Newsletter, Warteliste, Feedback, ...) ──
  if (email) {
    for (const { table, column } of EMAIL_TABLES) {
      try {
        const { data, error } = await supabase
          .from(table)
          .delete()
          .ilike(column, email)
          .select('id');
        if (error) {
          if (!isMissingTable(error.message)) warnings.push(`${table}: ${error.message}`);
          continue;
        }
        if (data?.length) removed[table] = data.length;
      } catch (e) {
        warnings.push(`${table}: ${String(e)}`);
      }
    }

    // Eingehende E-Mail-Konversationen ohne Kundenkonto (source='email')
    try {
      const { data, error } = await supabase
        .from('conversations')
        .delete()
        .ilike('customer_email', email)
        .select('id');
      if (error) {
        if (!isMissingTable(error.message) && !/customer_email/i.test(error.message)) {
          warnings.push('conversations (E-Mail): ' + error.message);
        }
      } else if (data?.length) {
        removed['nachrichten_konversationen'] =
          (removed['nachrichten_konversationen'] ?? 0) + data.length;
      }
    } catch { /* best effort */ }
  }

  // ── 8) Auth-Konto ────────────────────────────────────────────────────────
  if (mode === 'full') {
    // Keine Buchungen → hart loeschen. Klappt das wegen eines uebersehenen
    // Foreign-Keys nicht, fallen wir auf Umbenennen + Bannen zurueck (die
    // Original-E-Mail wird so trotzdem wieder frei).
    const { error: delErr } = await supabase.auth.admin.deleteUser(customerId);
    if (delErr) {
      warnings.push('Auth-Konto konnte nicht hart gelöscht werden: ' + delErr.message);
      const { error: renameErr } = await supabase.auth.admin.updateUserById(customerId, {
        email: `deleted_${customerId}@anonymisiert.local`,
        user_metadata: { deleted: true },
        ban_duration: '876000h', // ~100 Jahre = effektiv permanent
      });
      if (renameErr) {
        return {
          ok: false, mode, bookingCount, email, removed, warnings,
          error: 'Auth-Konto konnte nicht entfernt werden: ' + renameErr.message,
        };
      }
    }
  } else {
    // Buchungen vorhanden → geteilte Anonymisierung (E-Mail-Log-Scrub,
    // Auth-Rename + Ban, Audit-Details scrubben, Ausweis-URLs leeren).
    const anon = await anonymizeCustomerCore(supabase, customerId);
    if (!anon.ok) {
      return {
        ok: false, mode, bookingCount, email, removed, warnings,
        error: anon.error ?? 'Anonymisierung der Buchungsdaten fehlgeschlagen.',
      };
    }
  }

  // ── 9) Profil-Zeile entfernen → Kunde verschwindet aus der Kundenliste ───
  try {
    const { error } = await supabase.from('profiles').delete().eq('id', customerId);
    if (error) warnings.push('Profil: ' + error.message);
    else removed['profil'] = 1;
  } catch (e) {
    warnings.push('Profil: ' + String(e));
  }

  return { ok: true, mode, bookingCount, email, removed, warnings };
}
