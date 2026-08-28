/**
 * Orchestrator der KI-Auto-Beantwortung.
 *
 * Wird nach JEDER neuen Kundennachricht aufgerufen (E-Mail-Cron + Kundenkonto)
 * und entscheidet:
 *   - automatisch antworten  → Antwort geht raus, Nachricht als ai_generated
 *   - Entwurf vorschlagen    → conversations.ai_draft, Admin gibt frei
 *   - gar nichts             → Feature aus / kein Key / Fehler
 *
 * Grundregeln:
 *  - IMMER best-effort: diese Funktion wirft nie. Faellt etwas aus, bleibt die
 *    Anfrage einfach unbeantwortet im Posteingang liegen — wie vorher.
 *  - Alle Schreibzugriffe auf die neuen Spalten sind gegen eine fehlende
 *    Migration abgesichert.
 */

import type { createServiceClient } from '@/lib/supabase';
import { loadAiReplyConfig, KATEGORIE_LABEL } from '@/lib/ai/auto-reply-config';
import { entscheideAutoVersand, istWahrscheinlichAutoNachricht } from '@/lib/ai/auto-reply-gates';
import { generiereKundenAntwort, type VerlaufNachricht } from '@/lib/ai/kundenanfrage-antwort';
import { shopWissensbasis, buchungsKontext } from '@/lib/ai/kundenanfrage-kontext';
import { sendInboundReply, sendNewMessageNotificationToCustomer } from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';
import { getBerlinDayStartISO } from '@/lib/timezone';

type SB = ReturnType<typeof createServiceClient>;

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist/i;

/** Platzhalter-sender_id fuer Admin-/KI-Nachrichten (kein Supabase-Auth-User). */
const ADMIN_SENDER_ID = '00000000-0000-0000-0000-000000000000';

export type AutoReplyErgebnis =
  | { status: 'sent'; conversationId: string }
  | { status: 'draft'; conversationId: string; grund: string }
  | { status: 'skipped'; grund: string };

interface ConvRow {
  id: string;
  subject: string;
  customer_id: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  booking_id: string | null;
  closed: boolean;
  source?: string | null;
  inbox_address?: string | null;
  ai_auto_reply_count?: number | null;
}

/** Wie oft heute insgesamt automatisch geantwortet wurde (Tagesdeckel). */
async function autoAntwortenHeute(supabase: SB): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('ai_generated', true)
      .gte('created_at', getBerlinDayStartISO());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Entwurf an der Konversation speichern (defensiv ohne Migration). */
async function speichereEntwurf(
  supabase: SB,
  conversationId: string,
  entwurf: string,
  meta: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase
    .from('conversations')
    .update({
      ai_draft: entwurf,
      ai_draft_meta: meta,
      ai_draft_created_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
  return !error;
}

/**
 * Beantwortet die zuletzt eingegangene Kundennachricht einer Konversation.
 * Wirft nie.
 */
export async function verarbeiteKundenanfrage(
  supabase: SB,
  opts: {
    conversationId: string;
    kanal: 'email' | 'account';
    /**
     * true = niemals automatisch senden, immer nur einen Entwurf erzeugen.
     * Genutzt vom Admin-Button „Neu erzeugen" — dort hat der Mensch bewusst
     * die Hand am Steuer und will keine Mail ausloesen.
     */
    nurEntwurf?: boolean;
  },
): Promise<AutoReplyErgebnis> {
  try {
    const config = await loadAiReplyConfig(supabase);
    if (!config.enabled) return { status: 'skipped', grund: 'Feature deaktiviert' };
    // Kanal komplett abgeschaltet → gar nichts tun (auch kein Entwurf).
    // Ausnahme: der Admin hat den Entwurf ausdruecklich selbst angefordert.
    if (!opts.nurEntwurf) {
      if (opts.kanal === 'email' && !config.channels.email) {
        return { status: 'skipped', grund: 'Kanal E-Mail deaktiviert' };
      }
      if (opts.kanal === 'account' && !config.channels.account) {
        return { status: 'skipped', grund: 'Kanal Kundenkonto deaktiviert' };
      }
    }

    // ─── Konversation laden (mit Fallback auf altes Schema) ───────────────
    let conv: ConvRow | null = null;
    const full = await supabase
      .from('conversations')
      .select('id, subject, customer_id, customer_email, customer_name, booking_id, closed, source, inbox_address, ai_auto_reply_count')
      .eq('id', opts.conversationId)
      .maybeSingle();
    if (!full.error) {
      conv = full.data as ConvRow | null;
    } else if (SCHEMA_ERROR.test(full.error.message)) {
      const fb = await supabase
        .from('conversations')
        .select('id, subject, customer_id, booking_id, closed')
        .eq('id', opts.conversationId)
        .maybeSingle();
      conv = (fb.data as ConvRow | null) ?? null;
    }
    if (!conv) return { status: 'skipped', grund: 'Konversation nicht gefunden' };
    if (conv.closed) return { status: 'skipped', grund: 'Konversation geschlossen' };

    // ─── Verlauf laden ───────────────────────────────────────────────────
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_type, body, created_at')
      .eq('conversation_id', opts.conversationId)
      .order('created_at', { ascending: true })
      .limit(40);
    const verlauf: VerlaufNachricht[] = (msgs ?? []).map((m) => ({
      sender: m.sender_type === 'customer' ? 'customer' : 'admin',
      text: String(m.body ?? ''),
    }));
    const letzte = verlauf[verlauf.length - 1];
    if (!letzte || letzte.sender !== 'customer') {
      return { status: 'skipped', grund: 'Letzte Nachricht ist nicht vom Kunden' };
    }
    // Zweite Verteidigungslinie gegen Roboter-Pingpong.
    if (istWahrscheinlichAutoNachricht(letzte.text, conv.subject)) {
      return { status: 'skipped', grund: 'Automatische Nachricht erkannt' };
    }

    // ─── Faktenbasis ─────────────────────────────────────────────────────
    const kundenName = conv.customer_name || conv.customer_email?.split('@')[0] || 'Kunde';
    const [wissensbasis, buchungen] = await Promise.all([
      shopWissensbasis(supabase),
      buchungsKontext(supabase, {
        customerId: conv.customer_id,
        email: conv.customer_email ?? null,
        bookingId: conv.booking_id,
      }),
    ]);

    // ─── Antwort erzeugen ────────────────────────────────────────────────
    const ki = await generiereKundenAntwort(supabase, {
      betreff: conv.subject,
      verlauf,
      kundenName,
      wissensbasis,
      buchungen,
      extraKontext: config.extra_context,
    });

    // ─── Gates ───────────────────────────────────────────────────────────
    const gate = opts.nurEntwurf
      ? { auto: false, grund: 'Vom Admin manuell angefordert.', eskalation: [] as string[] }
      : entscheideAutoVersand({
          config,
          kanal: opts.kanal,
          kategorie: ki.kategorie,
          confidence: ki.confidence,
          brauchtMensch: ki.brauchtMensch,
          kundenText: letzte.text,
          autoAntwortenImThread: Number(conv.ai_auto_reply_count ?? 0),
          autoAntwortenHeute: await autoAntwortenHeute(supabase),
        });

    const meta = {
      kategorie: ki.kategorie,
      kategorie_label: KATEGORIE_LABEL[ki.kategorie],
      confidence: ki.confidence,
      braucht_mensch: ki.brauchtMensch,
      interne_notiz: ki.interneNotiz,
      grund: gate.grund,
      eskalation: gate.eskalation,
      kanal: opts.kanal,
      erstellt_am: new Date().toISOString(),
    };

    // ─── Entwurf-Pfad ────────────────────────────────────────────────────
    if (!gate.auto) {
      const gespeichert = await speichereEntwurf(supabase, opts.conversationId, ki.antwort, meta);
      if (!gespeichert) {
        // Haeufigster Fall: supabase-ai-auto-reply.sql wurde noch nicht
        // ausgefuehrt. Frueher lief das stumm ins Leere — der Admin sah weder
        // Antwort noch Entwurf und hatte keinen Hinweis auf die Ursache.
        console.error(
          '[ai-auto-reply] Entwurf nicht speicherbar — Migration supabase/supabase-ai-auto-reply.sql ausgefuehrt?',
        );
        return {
          status: 'skipped',
          grund: 'Entwurf nicht speicherbar — Migration supabase-ai-auto-reply.sql fehlt',
        };
      }
      await createAdminNotification(supabase, {
        type: 'ai_reply_draft',
        title: `Antwort-Entwurf bereit: ${KATEGORIE_LABEL[ki.kategorie]}`,
        message: `${kundenName}: ${conv.subject} — ${gate.grund}`,
        link: '/admin/nachrichten',
      });
      await logAudit({
        action: 'nachricht.ai_draft',
        entityType: 'nachricht',
        entityId: opts.conversationId,
        entityLabel: conv.subject,
        changes: { kategorie: ki.kategorie, confidence: ki.confidence, grund: gate.grund },
      });
      return { status: 'draft', conversationId: opts.conversationId, grund: gate.grund };
    }

    // ─── Auto-Versand-Pfad ───────────────────────────────────────────────
    const jetzt = new Date().toISOString();

    // Nachricht zuerst schreiben — sie ist der Nachweis der Antwort.
    let msgId: string | null = null;
    const insertBase = {
      conversation_id: opts.conversationId,
      sender_type: 'admin',
      sender_id: ADMIN_SENDER_ID,
      body: ki.antwort,
    };
    let ins = await supabase
      .from('messages')
      .insert({ ...insertBase, ai_generated: true })
      .select('id')
      .single();
    if (ins.error && SCHEMA_ERROR.test(ins.error.message)) {
      ins = await supabase.from('messages').insert(insertBase).select('id').single();
    }
    if (ins.error || !ins.data) {
      return { status: 'skipped', grund: 'Antwort konnte nicht gespeichert werden' };
    }
    msgId = ins.data.id;

    await supabase
      .from('conversations')
      .update({ last_message_at: jetzt })
      .eq('id', opts.conversationId);

    // Zaehler + Entwurf-Reset (defensiv, ohne Migration wirkungslos).
    await supabase
      .from('conversations')
      .update({
        ai_auto_reply_count: Number(conv.ai_auto_reply_count ?? 0) + 1,
        ai_last_auto_reply_at: jetzt,
        ai_draft: null,
        ai_draft_meta: meta,
        ai_draft_created_at: null,
      })
      .eq('id', opts.conversationId);

    // ─── Zustellung ──────────────────────────────────────────────────────
    if (opts.kanal === 'email') {
      let customerEmail = conv.customer_email || '';
      if (!customerEmail && conv.customer_id) {
        try {
          const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          customerEmail = data?.users?.find((u) => u.id === conv.customer_id)?.email || '';
        } catch {
          // ignore
        }
      }
      if (!customerEmail) return { status: 'skipped', grund: 'Keine E-Mail-Adresse hinterlegt' };

      let inReplyTo: string | null = null;
      const { data: lastInbound } = await supabase
        .from('messages')
        .select('email_message_id')
        .eq('conversation_id', opts.conversationId)
        .eq('sender_type', 'customer')
        .not('email_message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastInbound?.email_message_id) inReplyTo = lastInbound.email_message_id;

      const resendId = await sendInboundReply({
        customerEmail,
        customerName: kundenName,
        subject: conv.subject,
        body: ki.antwort,
        bookingId: conv.booking_id,
        inReplyToMessageId: inReplyTo,
        fromAddress: conv.inbox_address ?? undefined,
        autoReply: true,
      });
      if (resendId && msgId) {
        await supabase.from('messages').update({ email_message_id: resendId }).eq('id', msgId);
      }
    } else {
      // Kundenkonto: Hinweis-Mail wie bei einer manuellen Admin-Antwort.
      try {
        const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const customer = data?.users?.find((u) => u.id === conv.customer_id);
        if (customer?.email) {
          await sendNewMessageNotificationToCustomer({
            customerEmail: customer.email,
            customerName: customer.user_metadata?.full_name || customer.email.split('@')[0],
            subject: conv.subject,
            messagePreview: ki.antwort.slice(0, 200),
          });
        }
      } catch {
        // Benachrichtigung best-effort — die Antwort steht im Konto.
      }
    }

    await createAdminNotification(supabase, {
      type: 'ai_reply_sent',
      title: `Automatisch beantwortet: ${KATEGORIE_LABEL[ki.kategorie]}`,
      message: `${kundenName}: ${conv.subject}`,
      link: '/admin/nachrichten',
    });

    await logAudit({
      action: 'nachricht.ai_auto_reply',
      entityType: 'nachricht',
      entityId: opts.conversationId,
      entityLabel: conv.subject,
      changes: { kategorie: ki.kategorie, confidence: ki.confidence, kanal: opts.kanal },
    });

    return { status: 'sent', conversationId: opts.conversationId };
  } catch (err) {
    // Bewusst still: eine unbeantwortete Anfrage ist ein normaler Zustand,
    // ein Absturz im Cron/Request-Pfad waere ein echtes Problem.
    const text = err instanceof Error ? err.message : String(err);
    console.error('[ai-auto-reply]', text);
    // Fehlertext mitgeben (gekuerzt) — sonst steht in der Cron-Antwort nur
    // "Fehler" und der Admin raet, ob API-Key, Modell oder DB schuld ist.
    return { status: 'skipped', grund: `Fehler: ${text.slice(0, 200)}` };
  }
}
