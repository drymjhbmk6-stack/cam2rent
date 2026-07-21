/* cam2rent Admin 2.0 — Statische Beispieldaten (Design-Prototyp)
   KEINE DB, KEINE API. Eine Quelle für alle redesignten Screens. Werte aus den
   Mockups/Screenshots übernommen, damit die Optik realistisch wirkt. */

import type { BookingStatus } from '@/components/admin/ui/StatusChip';

export type Booking = {
  id: string;
  kunde: string;
  mail: string;
  modell: string;
  serial: string;
  von: string; // dd.mm.yyyy
  bis: string;
  tage: number;
  lieferart: 'versand' | 'abholung';
  betrag: string;
  status: BookingStatus;
  warn?: boolean;
};

export const BOOKINGS: Booking[] = [
  {
    id: 'C2R-2627-004',
    kunde: 'Johannes Ostermann',
    mail: 'johannes-ostermann01@gmx.de',
    modell: 'OSMO Action 5 Pro',
    serial: '82JXN3800BRXRA',
    von: '13.07.2026',
    bis: '20.07.2026',
    tage: 8,
    lieferart: 'versand',
    betrag: '38,75 €',
    status: 'delivered',
  },
  {
    id: 'C2R-2629-008',
    kunde: 'Amreswar V.',
    mail: 'amarvenkat30@gmail.com',
    modell: 'GoPro Hero13 Black',
    serial: 'C35313506152',
    von: '24.07.2026',
    bis: '27.07.2026',
    tage: 4,
    lieferart: 'versand',
    betrag: '48,67 €',
    status: 'shipped',
  },
  {
    id: 'C2R-2628-001',
    kunde: 'Peter Vieler',
    mail: 'x-prize-projekt@web.de',
    modell: 'DJI Osmo Nano 128 GB',
    serial: '9LTZP4800C0U4Z',
    von: '16.07.2026',
    bis: '10.08.2026',
    tage: 26,
    lieferart: 'versand',
    betrag: '122,42 €',
    status: 'delivered',
    warn: true,
  },
  {
    id: 'C2R-2626-002',
    kunde: 'Jennifer Jungbluth',
    mail: 'j_jungbluth@web.de',
    modell: 'GoPro Hero13 Black',
    serial: 'C35313506152',
    von: '05.07.2026',
    bis: '09.07.2026',
    tage: 5,
    lieferart: 'abholung',
    betrag: '52,00 €',
    status: 'completed',
  },
  {
    id: 'C2R-2630-003',
    kunde: 'Niclas Gerisch',
    mail: 'niclasgerisch@web.de',
    modell: 'Insta360 X5',
    serial: 'IAHYA2508E4UYH',
    von: '28.07.2026',
    bis: '02.08.2026',
    tage: 6,
    lieferart: 'versand',
    betrag: '89,90 €',
    status: 'awaiting_payment',
  },
];

export type QueueTone = 'danger' | 'warn' | 'neutral';
export type QueueTask = {
  id: string;
  when: string;
  tone: QueueTone;
  modell: string;
  serial: string;
  kunde: string;
  zeit: string;
  checks: string[];
  action: string;
  icon: 'truck' | 'return' | 'open' | 'label';
};

export const QUEUE: QueueTask[] = [
  {
    id: 'C2R-2629-008',
    when: 'Heute',
    tone: 'danger',
    modell: 'GoPro Hero13 Black',
    serial: '…615214',
    kunde: 'Amreswar V.',
    zeit: 'Versand heute raus',
    checks: ['Ausweis', 'Vertrag', 'Bezahlt'],
    action: 'Label drucken',
    icon: 'label',
  },
  {
    id: 'C2R-2627-004',
    when: 'In 3 Tagen',
    tone: 'warn',
    modell: 'OSMO Action 5 Pro',
    serial: '…BRXRA',
    kunde: 'Johannes Ostermann',
    zeit: 'Rückgabe 24.07.',
    checks: ['Ausweis', 'Vertrag', 'Geprüft', 'Bezahlt'],
    action: 'Rückgabe prüfen',
    icon: 'return',
  },
  {
    id: 'C2R-2629-008',
    when: 'In 6 Tagen',
    tone: 'neutral',
    modell: 'GoPro Hero13 Black',
    serial: '…615214',
    kunde: 'Amreswar V.',
    zeit: 'Rückgabe 27.07.',
    checks: [],
    action: 'Öffnen',
    icon: 'open',
  },
];

export type Shipment = {
  filter: 'versenden' | 'unterwegs' | 'pruefen' | 'fertig';
  richtung: 'Hinversand' | 'Retoure';
  modell: string;
  kunde: string;
  buchung: string;
  zeitraum: string;
  carrier: 'DHL' | 'DPD';
  tracking: string;
  trackStatus: string;
  trackTone: 'emerald' | 'amber' | 'blue';
  nextAction: string;
};

export const SHIPMENTS: Shipment[] = [
  {
    filter: 'pruefen',
    richtung: 'Retoure',
    modell: 'OSMO Action 5 Pro',
    kunde: 'Johannes Ostermann',
    buchung: 'C2R-2627-004',
    zeitraum: '13.07.–20.07.',
    carrier: 'DHL',
    tracking: '00340434810061399',
    trackStatus: 'Zugestellt an dich',
    trackTone: 'emerald',
    nextAction: 'Rückgabe prüfen',
  },
  {
    filter: 'versenden',
    richtung: 'Hinversand',
    modell: 'GoPro Hero13 Black',
    kunde: 'Amreswar V.',
    buchung: 'C2R-2629-008',
    zeitraum: '24.07.–27.07.',
    carrier: 'DHL',
    tracking: '00340434810061433',
    trackStatus: 'Etikett erstellt',
    trackTone: 'amber',
    nextAction: 'Paket packen',
  },
  {
    filter: 'unterwegs',
    richtung: 'Hinversand',
    modell: 'Insta360 X5',
    kunde: 'Niclas Gerisch',
    buchung: 'C2R-2630-003',
    zeitraum: '28.07.–02.08.',
    carrier: 'DPD',
    tracking: '00340434695396936660',
    trackStatus: 'Unterwegs · Zustellung morgen',
    trackTone: 'blue',
    nextAction: 'Sendung verfolgen',
  },
];

export type Camera = {
  marke: 'DJI' | 'GoPro' | 'Insta360';
  name: string;
  auslastung: number;
  tag: string;
  ersatz: string;
};

export const CAMERAS: Camera[] = [
  { marke: 'DJI', name: 'OSMO Action 5 Pro', auslastung: 100, tag: '9 €', ersatz: '99 €' },
  { marke: 'DJI', name: 'DJI Osmo Pocket 4', auslastung: 0, tag: '14 €', ersatz: '188 €' },
  { marke: 'DJI', name: 'DJI Osmo Nano 128 GB', auslastung: 30, tag: '7 €', ersatz: '81 €' },
  { marke: 'GoPro', name: 'GoPro Hero13 Black', auslastung: 43, tag: '12 €', ersatz: '149 €' },
  { marke: 'Insta360', name: 'Insta360 X5', auslastung: 13, tag: '15 €', ersatz: '199 €' },
  { marke: 'Insta360', name: 'Insta360 Ace Pro 2', auslastung: 0, tag: '12 €', ersatz: '149 €' },
];

export type SetItem = {
  marke: 'GoPro' | 'Insta360' | 'DJI';
  name: string;
  preis: string;
  einzel: string;
  spar: string;
  badges: string[];
  verfuegbar: boolean;
};

export const SETS: SetItem[] = [
  { marke: 'GoPro', name: 'Basic Set', preis: '0,00 €', einzel: '10,90 €', spar: '10,90 €', badges: [], verfuegbar: true },
  { marke: 'GoPro', name: 'Motorrad Set', preis: '24,90 €', einzel: '33,50 €', spar: '8,60 €', badges: ['Beliebt'], verfuegbar: true },
  { marke: 'GoPro', name: 'Taucher Set', preis: '29,90 €', einzel: '46,50 €', spar: '16,60 €', badges: ['Wasserdicht'], verfuegbar: true },
  { marke: 'GoPro', name: 'Allrounder Set', preis: '69,90 €', einzel: '104,90 €', spar: '35,00 €', badges: ['Komplett'], verfuegbar: false },
  { marke: 'Insta360', name: 'Reise Set', preis: '19,90 €', einzel: '18,80 €', spar: '—', badges: ['Wasserdicht'], verfuegbar: true },
];

export type Accessory = {
  kat: string;
  name: string;
  preis: string;
  cams: string[];
  buchbar: boolean;
};

export const ACCESSORIES: Accessory[] = [
  { kat: 'Akku', name: 'Extra Akku', preis: '10,90 €', cams: ['GoPro'], buchbar: true },
  { kat: 'Akku', name: 'Extra Akku', preis: '10,90 €', cams: ['OSMO'], buchbar: true },
  { kat: 'Schutz', name: 'Wasserdichtes Gehäuse', preis: '9,90 €', cams: ['GoPro'], buchbar: true },
  { kat: 'Speicher', name: '128 GB', preis: '2,00 €', cams: ['Alle'], buchbar: true },
  { kat: 'Speicher', name: '512 GB', preis: '4,00 €', cams: ['Alle'], buchbar: true },
  { kat: 'Stativ', name: 'Stativ max. 165cm', preis: '7,90 €', cams: ['GoPro', 'OSMO', 'X5'], buchbar: true },
  { kat: 'Mikrofon', name: 'Funkmikrofon 2 Empfänger', preis: '29,90 €', cams: ['GoPro', 'OSMO'], buchbar: true },
  { kat: 'Sonstiges', name: 'Befestigungsschraube', preis: '—', cams: ['Alle'], buchbar: false },
];

export type InventoryUnit = { bezeichnung: string; code: string; serial: string };

export const INVENTORY: InventoryUnit[] = [
  { bezeichnung: '128 GB', code: 'STO-SAN-128-01', serial: '—' },
  { bezeichnung: '512 GB', code: 'STO-SAN-512-03', serial: '—' },
  { bezeichnung: '3m Selfi-Stick', code: 'STA-INS-INVIS3M-01', serial: '—' },
  { bezeichnung: 'Brusthalterung', code: 'STA-GEN-CHEST-01', serial: '—' },
  { bezeichnung: 'DJI Action 5 Pro', code: 'CAM-DJI-OA5-02', serial: '82JQP1A00BG1DG' },
  { bezeichnung: 'DJI Action 5 Pro', code: 'CAM-DJI-OA5-01', serial: '82JXN3800BRXRA' },
  { bezeichnung: 'DJI Osmo Nano', code: 'CAM-DJI-NANO-01', serial: '9LTZP4800C0U4Z' },
  { bezeichnung: 'Extra Akku', code: 'BAT-DJI-1950-01', serial: '—' },
  { bezeichnung: 'Funkmikrofon 2 Empf.', code: 'AUD-GOD-CUBEC-01', serial: '—' },
  { bezeichnung: 'GoPro Hero 13 Black', code: 'CAM-GPR-H13B-01', serial: 'C35313506152' },
  { bezeichnung: 'Insta360 X5', code: 'CAM-INS-X5-01', serial: 'IAHYA2508E4UYH' },
  { bezeichnung: 'Ladestation GoPro', code: 'BAT-GPR-CHRGH13-01', serial: '—' },
  { bezeichnung: 'Mini Verlängerungsstab', code: 'STA-DJI-EXTROD-01', serial: '7APXN7700' },
  { bezeichnung: 'Transporttasche/Koffer', code: 'CAS-GEN-X5-01', serial: '—' },
];

export type Firmware = {
  name: string;
  version: string;
  tone: 'update' | 'error' | 'ok';
  note: string;
};

export const FIRMWARE: Firmware[] = [
  { name: 'DJI Osmo Nano', version: 'v01.01.16.50', tone: 'update', note: 'Neues Update (erschienen 24.11.2025)' },
  { name: 'DJI Action 5 Pro', version: '01.06.01.04', tone: 'error', note: 'Quelle nicht von Hersteller-Domain — verworfen (Halluzinationsschutz)' },
  { name: 'DJI Osmo Pocket 4', version: '—', tone: 'error', note: 'Quelle nicht von Hersteller-Domain — verworfen' },
  { name: 'GoPro Hero 13 Black', version: '2.10', tone: 'ok', note: 'Aktuell' },
  { name: 'Insta360 Ace Pro 2', version: '2.0.3', tone: 'ok', note: 'Aktuell (erschienen 12.11.2025)' },
  { name: 'Insta360 X5', version: '1.10.7', tone: 'ok', note: 'Aktuell (erschienen 31.1.2026)' },
];

export type Customer = { name: string; mail: string; status: 'aktiv' | 'gesperrt' | 'inaktiv'; tester?: boolean };

export const CUSTOMERS: Customer[] = [
  { name: 'Asoski, Edmir', mail: 'edmir.asoski@gmail.com', status: 'aktiv' },
  { name: 'Bolenius, Sebastian', mail: 'sebastian.bolenius@web.de', status: 'aktiv' },
  { name: 'Dannenbring, Diana', mail: 'diana.dannenbring@gmail.com', status: 'aktiv' },
  { name: 'David, Dennis', mail: 'dennis.david10e@gmail.com', status: 'aktiv', tester: true },
  { name: 'Gerisch, Niclas', mail: 'niclasgerisch@web.de', status: 'aktiv' },
  { name: 'Hefner, Jonathan', mail: 'hello@jonathanhefner.de', status: 'aktiv' },
  { name: 'Jungbluth, Jennifer', mail: 'j_jungbluth@web.de', status: 'aktiv' },
  { name: 'Ostermann, Johannes', mail: 'johannes-ostermann01@gmx.de', status: 'aktiv' },
  { name: 'Vieler, Peter', mail: 'x-prize-projekt@web.de', status: 'gesperrt' },
];

export type Message = { name: string; betreff: string; vor: string; offen: boolean; kanal: 'email' | 'konto'; preview: string };

export const MESSAGES: Message[] = [
  { name: 'Kai Röhlig', betreff: 'DJI Action 5 Außenlinse gesprungen', vor: '5d', offen: true, kanal: 'email', preview: 'Hallo Lennart, ich habe jetzt öfters probiert…' },
  { name: 'Johannes Ostermann', betreff: 'Rücksende-Label', vor: '12d', offen: false, kanal: 'konto', preview: 'Du: Wir schauen uns das Problem an…' },
  { name: 'Susanne Steim', betreff: 'Retoure', vor: '29d', offen: false, kanal: 'email', preview: 'Du: Hallo, wann möchtest Du die Kameras zurückbringen?' },
  { name: 'Niclas Gerisch', betreff: 'Frage zur Kamera SD-Karte', vor: '39d', offen: false, kanal: 'konto', preview: 'Hey Lennart, danke für die Info…' },
];

export type WaitlistGroup = { produkt: string; leute: { mail: string; useCase: string }[] };

export const WAITLIST: WaitlistGroup[] = [
  {
    produkt: 'Insta360 Ace Pro 2',
    leute: [
      { mail: 'johannes-ostermann01@gmx.de', useCase: 'Klettern / Outdoor' },
      { mail: 'edmir.asoski@gmail.com', useCase: '—' },
      { mail: 'inumikaku@gmail.com', useCase: 'Vlog / Content' },
    ],
  },
  {
    produkt: 'DJI Osmo Pocket 4',
    leute: [
      { mail: 'elham.mirafzali@gmail.com', useCase: 'Event' },
      { mail: 'edmir.asoski@gmail.com', useCase: '—' },
    ],
  },
];

/* Detail einer Beispiel-Buchung (Buchungsdetail-Screen). */
export const BOOKING_DETAIL = {
  id: 'C2R-2627-004',
  status: 'delivered' as BookingStatus,
  erstellt: '30.06.2026, 21:15',
  produkt: 'OSMO Action 5 Pro',
  serial: '82JXN3800BRXRA',
  zeitraum: 'Mo. 13.07.2026 – Mo. 20.07.2026',
  tage: 8,
  lieferart: 'Versand · Standard',
  kunde: 'Johannes Ostermann',
  mail: 'johannes-ostermann01@gmx.de',
  adresse: 'Roonstraße 7, 51373 Leverkusen',
  gesamt: '38,75 €',
  miete: '51,00 €',
  rabatt: '−12,25 €',
  haftung: 'Keine Haftungsbegrenzung',
  paymentIntent: 'pi_3To77…TtZZ',
  tracking: '00340434695396898791',
  versandtAm: '08.07.2026, 07:00',
  set: [
    ['Extra Akku', '1×'],
    ['Ladekabel', '1×'],
    ['64 GB', '1×'],
    ['Selfi-Stick', '1×'],
    ['Befestigungsschraube', '2×'],
    ['Transporttasche/ Koffer', '1×'],
  ] as [string, string][],
  wbw: [
    ['OSMO Action 5 Pro', '340,71 €', null],
    ['Extra Akku (Set)', '19,99 €', null],
    ['Ladekabel (Set)', '5,36 €', null],
    ['64 GB (Set)', '7,85 €', null],
    ['Selfi-Stick (Set)', '30,00 €', null],
    ['2× Befestigungsschraube', '0,00 €', 'Quelle unbekannt'],
    ['Transporttasche/ Koffer', '0,00 €', 'Quelle unbekannt'],
  ] as [string, string, string | null][],
  wbwGesamt: '403,91 €',
  wbwZubehoer: '63,20 €',
  vertragHash: '5f780cbfd18516941e72ee036f4187d6086be77b4bc763fb1ededdefd7209026',
  vertragUnterzeichnet: '30.06.2026, 21:16',
  vertragIp: '2a0a:a548:3cce…',
  verlauf: [
    { t: 'Buchung erstellt', d: '30.06.2026, 21:15', tone: 'cyan' as const },
    { t: 'Vertrag unterschrieben', d: '30.06.2026, 21:16', tone: 'cyan' as const },
    { t: 'Zahlung eingegangen — 38,75 € (Stripe)', d: '05.07.2026, 13:48', tone: 'cyan' as const },
    { t: 'Verlängert (ursprgl. bis 19.07.)', d: '05.07.2026, 13:48', tone: 'cyan' as const },
    { t: 'Versendet', d: '08.07.2026, 07:00', tone: 'emerald' as const },
    { t: 'Beim Kunden zugestellt', d: '08.07.2026, 09:12', tone: 'emerald' as const },
  ],
  rechnungen: [
    { titel: 'Ursprüngliche Rechnung', datum: '05.07.2026, 13:48', betrag: '36,75 €', sub: 'Noch nicht an Kunden gesendet', aktuell: false },
    { titel: 'Anpassung Nr. 2', datum: '05.07.2026, 13:48', betrag: '38,75 €', sub: 'Verlängerung um 1 Tag · noch nicht gesendet', aktuell: true },
  ],
};

/* Dashboard-Kennzahlen (statisch). */
export const DASHBOARD_STATS = {
  heute: [
    { value: '0', label: 'Buchungen', tone: 'zero' as const },
    { value: '1', label: 'Versand offen', tone: 'accent' as const },
    { value: '0', label: 'Rückgaben', tone: 'zero' as const },
    { value: '2', label: 'Rückgabe prüfen', tone: 'danger' as const },
  ],
  umsatz: [
    { value: '0 €', label: 'heute', tone: 'zero' as const },
    { value: '48,67 €', label: 'Woche', tone: 'default' as const },
    { value: '205,96 €', label: 'Monat', tone: 'strong' as const },
  ],
  bestand: [
    { value: '1', label: 'aktiv', tone: 'default' as const },
    { value: '25', label: 'Kunden', tone: 'default' as const },
    { value: '+1', label: 'neu', tone: 'accent' as const },
  ],
};
