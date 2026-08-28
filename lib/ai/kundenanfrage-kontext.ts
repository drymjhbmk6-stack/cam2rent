/**
 * Wissensbasis fuer die KI-Beantwortung von Kundenanfragen.
 *
 * Sammelt die harten Fakten AUS DER DATENBANK (Preise, Zubehoer, Versand,
 * Haftungsschutz, Storno-Staffel, Kontaktdaten) und — falls die Anfrage einem
 * Kunden zugeordnet werden kann — dessen aktuelle Buchungen.
 *
 * WICHTIG: Die KI bekommt ausschliesslich diesen Text als Faktenquelle. Sie
 * darf nichts dazuerfinden; steht etwas hier nicht drin, muss sie an den
 * Menschen uebergeben. Deshalb wird hier lieber ein Feld weggelassen als ein
 * geratener Wert eingesetzt.
 *
 * Alle Loader sind best-effort: faellt eine Quelle aus, fehlt nur der
 * entsprechende Block — die Antwortgenerierung laeuft weiter.
 */

import type { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { getAccessories } from '@/lib/get-accessories';
import { getPriceForDays } from '@/data/products';
import { DEFAULT_SHIPPING, DEFAULT_HAFTUNG, getEigenbeteiligung } from '@/lib/price-config';
import type { HaftungConfig, ShippingPriceConfig } from '@/lib/price-config';
import type { Product } from '@/data/products';
import { describeCancellationTiers, cancellationTierLine } from '@/lib/cancellation-text';
import { loadBufferDays } from '@/lib/booking-buffer';
import { BUSINESS } from '@/lib/business-config';
import { BOOKING_STATUS_CONFIG } from '@/lib/booking-status-labels';
import { fmtDate } from '@/lib/format-utils';

type SB = ReturnType<typeof createServiceClient>;

interface SetRow {
  name: string;
  price: number | string | null;
  pricing_mode?: string | null;
  description?: string | null;
  available?: boolean | null;
}

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Kameras inkl. Beispielpreisen (1/3/7/14 Tage) + Kaution + Verfuegbarkeit. */
async function kamerasBlock(): Promise<string> {
  const products = await getProducts();
  if (products.length === 0) return '';
  const lines = products.map((p: Product) => {
    const preise = [1, 3, 7, 14]
      .map((d) => `${d} Tag${d > 1 ? 'e' : ''}: ${eur(getPriceForDays(p, d))}`)
      .join(' · ');
    const bestand =
      p.hasUnits === false
        ? 'noch nicht im Verleih (Warteliste)'
        : p.stock > 0
          ? `${p.stock} Stück im Bestand`
          : 'aktuell kein Exemplar im Bestand';
    const specs = [
      p.specs?.resolution && `Auflösung ${p.specs.resolution}`,
      p.specs?.waterproof && `wasserdicht: ${p.specs.waterproof}`,
      p.specs?.battery && `Akku ${p.specs.battery}`,
    ]
      .filter(Boolean)
      .join(', ');
    return [
      `- ${p.name} (${p.brand}${p.category ? `, ${p.category}` : ''})`,
      `  Preise: ${preise}`,
      `  Kaution/Anker: ${eur(p.deposit)} · ${bestand}`,
      specs ? `  Technik: ${specs}` : '',
      p.shortDescription ? `  Kurz: ${p.shortDescription.slice(0, 160)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `## Kameras im Verleih\n${lines.join('\n')}`;
}

/** Buchbares Zubehoer mit Preis + Abrechnungsart. */
async function zubehoerBlock(): Promise<string> {
  const accs = await getAccessories();
  const usable = accs.filter((a) => a.available !== false && !a.internal);
  if (usable.length === 0) return '';
  const lines = usable
    .slice(0, 60)
    .map(
      (a) =>
        `- ${a.name}: ${eur(a.price)} ${a.pricingMode === 'flat' ? 'einmalig' : 'pro Tag'}`,
    );
  return `## Zubehör (einzeln buchbar)\n${lines.join('\n')}`;
}

/** Sets (Bundles) mit Preis. */
async function setsBlock(supabase: SB): Promise<string> {
  try {
    const { data } = await supabase
      .from('sets')
      .select('name, price, pricing_mode, description, available')
      .order('price', { ascending: true })
      .limit(30);
    const rows = (data ?? []).filter((s: SetRow) => s.available !== false);
    if (rows.length === 0) return '';
    const lines = rows.map((s: SetRow) => {
      const mode = (s.pricing_mode ?? 'flat') === 'perDay' ? 'pro Tag' : 'einmalig';
      return `- ${s.name}: ${eur(Number(s.price) || 0)} ${mode}`;
    });
    return `## Sets / Pakete\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/** Versandkosten + Gratis-Schwelle + Abholung. */
async function versandBlock(supabase: SB): Promise<string> {
  let cfg: ShippingPriceConfig = DEFAULT_SHIPPING;
  try {
    const { data } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    const raw = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
    if (raw && typeof raw === 'object') cfg = { ...DEFAULT_SHIPPING, ...(raw as ShippingPriceConfig) };
  } catch {
    // Defaults
  }
  return [
    '## Versand & Abholung',
    `- Standardversand: ${eur(cfg.standardPrice)}`,
    `- Expressversand: ${eur(cfg.expressPrice)} — kostet IMMER extra, auch oberhalb der Gratis-Schwelle`,
    `- Gratis-Standardversand ab ${eur(cfg.freeShippingThreshold)} Warenwert`,
    `- Selbstabholung in ${BUSINESS.city} ist kostenlos (Termin wird individuell abgesprochen)`,
    '- Rückversand: dem Paket liegt ein Retourenlabel bei bzw. es wird per E-Mail geschickt',
  ].join('\n');
}

/** Haftungsschutz-Optionen + Hoechstbetrag der Ersatzpflicht. */
async function haftungBlock(supabase: SB): Promise<string> {
  let cfg: HaftungConfig = DEFAULT_HAFTUNG;
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    const raw = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
    if (raw && typeof raw === 'object') cfg = { ...DEFAULT_HAFTUNG, ...(raw as HaftungConfig) };
  } catch {
    // Defaults
  }
  const kategorien = Object.entries(cfg.eigenbeteiligungByCategory ?? {})
    .map(([k, v]) => `${k}: ${eur(Number(v))}`)
    .join(', ');
  return [
    '## Haftungsschutz (KEINE Versicherung im Sinne des VVG)',
    `- Ohne Haftungsschutz: der Mieter haftet bis zum Wiederbeschaffungswert des Geräts.`,
    `- Basis-Haftungsschutz: ab ${eur(cfg.standard)} (1–7 Tage), +${eur(cfg.standardIncrement)} je weitere angefangene Woche.`,
    `  Höchstbetrag der Ersatzpflicht: ${eur(getEigenbeteiligung(cfg))}${kategorien ? ` (nach Kategorie: ${kategorien})` : ''}.`,
    `- Premium-Haftungsschutz: ab ${eur(cfg.premium)} (1–7 Tage), +${eur(cfg.premiumIncrement)} je weitere angefangene Woche.`,
    '  Höchstbetrag der Ersatzpflicht: 0,00 € — den darüber hinausgehenden Schaden trägt cam2rent.',
    '- Wichtig: Das Wort „Versicherung" NIE als Bezeichnung verwenden. Es ist ein Haftungsschutz,',
    '  also eine vertragliche Begrenzung der Ersatzpflicht.',
  ].join('\n');
}

/** Storno-Staffel aus der einen Quelle (data/cancellation.ts). */
function stornoBlock(): string {
  const lines = describeCancellationTiers().map((t) => `- ${cancellationTierLine(t)}`);
  return [
    '## Stornierung',
    ...lines,
    '- Maßgeblich ist der ursprüngliche Mietbeginn (eine Verlegung öffnet die Frist nicht neu).',
    '- Storniert wird im Kundenkonto unter „Meine Buchungen" oder auf Anfrage per E-Mail.',
  ].join('\n');
}

/** Vorlaufzeiten (Puffertage) fuer Versand/Abholung. */
async function vorlaufBlock(supabase: SB): Promise<string> {
  try {
    const buf = await loadBufferDays(supabase);
    return [
      '## Vorlauf & Termine',
      `- Versand: Das Paket geht rund ${buf.versand_before} Tag(e) vor Mietbeginn raus, Rückgabe-Puffer ${buf.versand_after} Tag(e) nach Mietende.`,
      `- Abholung: bereit rund ${buf.abholung_before} Tag(e) vor Mietbeginn, Rückgabe bis ${buf.abholung_after} Tag(e) nach Mietende.`,
      '- Die im Shop angezeigten freien Tage sind verbindlich — der Kalender berücksichtigt die Puffer bereits.',
    ].join('\n');
  } catch {
    return '';
  }
}

/** Kontakt-/Firmendaten. */
function kontaktBlock(): string {
  return [
    '## Kontakt & Unternehmen',
    `- ${BUSINESS.name}, ${BUSINESS.fullAddress}`,
    `- E-Mail: ${BUSINESS.emailKontakt} · Web: ${BUSINESS.url}`,
    BUSINESS.phone ? `- Telefon: ${BUSINESS.phone}` : '',
    '- Buchung läuft ausschließlich online über die Website.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Buchungen des anfragenden Kunden (max. 5, neueste zuerst).
 * Ohne Treffer bleibt der Block leer — die KI weiss dann, dass sie keine
 * buchungsbezogene Auskunft geben darf.
 */
export async function buchungsKontext(
  supabase: SB,
  opts: { customerId?: string | null; email?: string | null; bookingId?: string | null },
): Promise<string> {
  try {
    const cols =
      'id, status, product_name, rental_from, rental_to, delivery_mode, tracking_number, tracking_url, price_total, contract_signed, created_at';
    let rows: Record<string, unknown>[] = [];

    if (opts.customerId) {
      const { data } = await supabase
        .from('bookings')
        .select(cols)
        .eq('user_id', opts.customerId)
        .order('created_at', { ascending: false })
        .limit(5);
      rows = data ?? [];
    }
    if (rows.length === 0 && opts.email) {
      const { data } = await supabase
        .from('bookings')
        .select(cols)
        .ilike('customer_email', opts.email)
        .order('created_at', { ascending: false })
        .limit(5);
      rows = data ?? [];
    }
    if (rows.length === 0 && opts.bookingId) {
      const { data } = await supabase
        .from('bookings')
        .select(cols)
        .eq('id', opts.bookingId)
        .limit(1);
      rows = data ?? [];
    }
    if (rows.length === 0) return '';

    const lines = rows.map((b) => {
      const status = BOOKING_STATUS_CONFIG[String(b.status)]?.label ?? String(b.status ?? '');
      const von = b.rental_from ? fmtDate(String(b.rental_from)) : '?';
      const bis = b.rental_to ? fmtDate(String(b.rental_to)) : '?';
      const art = b.delivery_mode === 'versand' ? 'Versand' : 'Abholung';
      const tracking = b.tracking_number ? ` · Sendungsnummer ${b.tracking_number}` : '';
      const vertrag = b.contract_signed === false ? ' · Mietvertrag noch NICHT unterschrieben' : '';
      return `- ${b.id}: ${b.product_name ?? 'Buchung'} · ${von} bis ${bis} · ${art} · Status: ${status}${tracking}${vertrag}`;
    });
    return `## Buchungen dieses Kunden (aktueller Stand)\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/** Statischer Teil der Wissensbasis (fuer alle Anfragen gleich). */
export async function shopWissensbasis(supabase: SB): Promise<string> {
  const [kameras, zubehoer, sets, versand, haftung, vorlauf] = await Promise.all([
    kamerasBlock().catch(() => ''),
    zubehoerBlock().catch(() => ''),
    setsBlock(supabase).catch(() => ''),
    versandBlock(supabase).catch(() => ''),
    haftungBlock(supabase).catch(() => ''),
    vorlaufBlock(supabase).catch(() => ''),
  ]);
  return [kameras, zubehoer, sets, versand, haftung, stornoBlock(), vorlauf, kontaktBlock()]
    .filter(Boolean)
    .join('\n\n');
}
