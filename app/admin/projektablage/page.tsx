'use client';

/**
 * Projektablage — private Datei-Ablage (Owner-only).
 *
 * Drei Ansichten in einer Seite: Projekte -> Stände -> Dateibaum.
 * Bewusst KEIN Code-Viewer: die Ablage ist zum Sichern und Zurückholen da,
 * nicht zum Arbeiten.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, Button, Modal, EmptyState, Skeleton } from '@/components/admin/ui';
import { useToast, useConfirm } from '@/components/admin/ui/FeedbackProvider';
import { fmtBytes } from '@/lib/projektablage-shared';
import { fmtDateTimeShort } from '@/lib/format-utils';
import UploadDialog from './UploadDialog';

interface Projekt {
  id: string;
  name: string;
  beschreibung: string | null;
  created_at: string;
  updated_at: string;
  stand_anzahl: number;
  bytes_gesamt: number;
  datei_anzahl: number;
  letzter_stand_at: string | null;
}

interface Stand {
  id: string;
  version_nr: number;
  notiz: string | null;
  status: 'uploading' | 'fertig' | 'abgebrochen';
  datei_anzahl: number;
  bytes_gesamt: number;
  created_at: string;
  finished_at: string | null;
}

interface DateiEintrag {
  id: string;
  relPfad: string;
  groesse: number;
  hochgeladen: boolean;
}

// ============================================================
// Dateibaum
// ============================================================

interface Ordner {
  name: string;
  ordner: Map<string, Ordner>;
  dateien: { id: string; name: string; groesse: number }[];
}

function leererOrdner(name: string): Ordner {
  return { name, ordner: new Map(), dateien: [] };
}

/** Baut aus den flachen relativen Pfaden einen Ordnerbaum. */
function baueBaum(dateien: DateiEintrag[]): Ordner {
  const wurzel = leererOrdner('');
  for (const datei of dateien) {
    const teile = datei.relPfad.split('/');
    let aktuell = wurzel;
    for (let i = 0; i < teile.length - 1; i++) {
      const segment = teile[i];
      let kind = aktuell.ordner.get(segment);
      if (!kind) {
        kind = leererOrdner(segment);
        aktuell.ordner.set(segment, kind);
      }
      aktuell = kind;
    }
    aktuell.dateien.push({
      id: datei.id,
      name: teile[teile.length - 1],
      groesse: datei.groesse,
    });
  }
  return wurzel;
}

function OrdnerZeile({
  ordner,
  pfad,
  offen,
  toggle,
  tiefe,
}: {
  ordner: Ordner;
  pfad: string;
  offen: Set<string>;
  toggle: (p: string) => void;
  tiefe: number;
}) {
  const unterordner = Array.from(ordner.ordner.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const dateien = [...ordner.dateien].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <>
      {unterordner.map((kind) => {
        const kindPfad = pfad ? `${pfad}/${kind.name}` : kind.name;
        const istOffen = offen.has(kindPfad);
        const anzahl = zaehleDateien(kind);
        return (
          <div key={kindPfad}>
            <button
              type="button"
              onClick={() => toggle(kindPfad)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 8px', paddingLeft: 8 + tiefe * 16,
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', fontSize: 14, color: 'var(--admin-text)',
                borderRadius: 6,
              }}
            >
              <span style={{ color: 'var(--admin-text-dim)', fontSize: 11, width: 10 }}>
                {istOffen ? '▾' : '▸'}
              </span>
              <span>📁</span>
              <span style={{ fontWeight: 600 }}>{kind.name}</span>
              <span style={{ color: 'var(--admin-text-dim)', fontSize: 12 }}>{anzahl}</span>
            </button>
            {istOffen && (
              <OrdnerZeile ordner={kind} pfad={kindPfad} offen={offen} toggle={toggle} tiefe={tiefe + 1} />
            )}
          </div>
        );
      })}

      {dateien.map((datei) => (
        <a
          key={datei.id}
          href={`/api/admin/projektablage/datei/${datei.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', paddingLeft: 8 + tiefe * 16 + 18,
            fontSize: 14, color: 'var(--admin-text-2)', textDecoration: 'none',
            borderRadius: 6,
          }}
        >
          <span>📄</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {datei.name}
          </span>
          <span style={{ color: 'var(--admin-text-dim)', fontSize: 12, flexShrink: 0 }}>
            {fmtBytes(datei.groesse)}
          </span>
          <span style={{ color: 'var(--admin-accent)', fontSize: 13, flexShrink: 0 }}>⬇</span>
        </a>
      ))}
    </>
  );
}

function zaehleDateien(ordner: Ordner): number {
  let n = ordner.dateien.length;
  for (const kind of ordner.ordner.values()) n += zaehleDateien(kind);
  return n;
}

// ============================================================
// Seite
// ============================================================

export default function ProjektablageSeite() {
  const toast = useToast();
  const confirm = useConfirm();

  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [laden, setLaden] = useState(true);
  const [migrationOffen, setMigrationOffen] = useState(false);
  const [zugriffVerweigert, setZugriffVerweigert] = useState(false);

  const [aktivesProjekt, setAktivesProjekt] = useState<Projekt | null>(null);
  const [staende, setStaende] = useState<Stand[]>([]);
  const [staendeLaden, setStaendeLaden] = useState(false);

  const [aktiverStand, setAktiverStand] = useState<Stand | null>(null);
  const [dateien, setDateien] = useState<DateiEintrag[]>([]);
  const [dateienLaden, setDateienLaden] = useState(false);
  const [offeneOrdner, setOffeneOrdner] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState('');

  const [neuOffen, setNeuOffen] = useState(false);
  const [neuName, setNeuName] = useState('');
  const [neuBeschreibung, setNeuBeschreibung] = useState('');
  const [neuLaeuft, setNeuLaeuft] = useState(false);
  const [uploadOffen, setUploadOffen] = useState(false);

  const ladeProjekte = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch('/api/admin/projektablage', { cache: 'no-store' });
      if (res.status === 403) {
        setZugriffVerweigert(true);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Projekte konnten nicht geladen werden.');
        return;
      }
      setProjekte(json.projekte ?? []);
      setMigrationOffen(Boolean(json.migration_pending));
    } catch {
      toast.error('Verbindung unterbrochen.');
    } finally {
      setLaden(false);
    }
  }, [toast]);

  useEffect(() => { void ladeProjekte(); }, [ladeProjekte]);

  const ladeStaende = useCallback(async (projektId: string) => {
    setStaendeLaden(true);
    try {
      const res = await fetch(`/api/admin/projektablage/${projektId}/staende`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Stände konnten nicht geladen werden.');
        return;
      }
      setStaende(json.staende ?? []);
    } finally {
      setStaendeLaden(false);
    }
  }, [toast]);

  const ladeDateien = useCallback(async (standId: string) => {
    setDateienLaden(true);
    try {
      const res = await fetch(`/api/admin/projektablage/staende/${standId}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Dateien konnten nicht geladen werden.');
        return;
      }
      setDateien(json.dateien ?? []);
      // Oberste Ebene direkt aufklappen — sonst sieht man beim Öffnen nichts.
      const wurzel = baueBaum(json.dateien ?? []);
      setOffeneOrdner(new Set(Array.from(wurzel.ordner.keys())));
    } finally {
      setDateienLaden(false);
    }
  }, [toast]);

  function oeffneProjekt(p: Projekt) {
    setAktivesProjekt(p);
    setAktiverStand(null);
    setStaende([]);
    void ladeStaende(p.id);
  }

  function oeffneStand(s: Stand) {
    setAktiverStand(s);
    setDateien([]);
    setSuche('');
    void ladeDateien(s.id);
  }

  async function projektAnlegen() {
    if (!neuName.trim()) return;
    setNeuLaeuft(true);
    try {
      const res = await fetch('/api/admin/projektablage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: neuName, beschreibung: neuBeschreibung }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Projekt konnte nicht angelegt werden.');
        return;
      }
      setProjekte((prev) => [json.projekt, ...prev]);
      setNeuOffen(false);
      setNeuName('');
      setNeuBeschreibung('');
      toast.success('Projekt angelegt.');
    } finally {
      setNeuLaeuft(false);
    }
  }

  async function projektLoeschen(p: Projekt) {
    const ok = await confirm({
      title: 'Projekt löschen?',
      message: `„${p.name}" wird mit allen ${p.stand_anzahl} Ständen und allen Dateien unwiderruflich gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/admin/projektablage/${p.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Projekt konnte nicht gelöscht werden.');
      return;
    }
    setProjekte((prev) => prev.filter((x) => x.id !== p.id));
    if (aktivesProjekt?.id === p.id) {
      setAktivesProjekt(null);
      setAktiverStand(null);
    }
    toast.success('Projekt gelöscht.');
  }

  async function standLoeschen(s: Stand) {
    const unvollstaendig = s.status !== 'fertig';
    const ok = await confirm({
      title: unvollstaendig ? 'Unvollständigen Stand aufräumen?' : `Stand v${s.version_nr} löschen?`,
      message: unvollstaendig
        ? 'Der abgebrochene Upload wird samt bereits hochgeladener Dateien entfernt.'
        : `Alle ${s.datei_anzahl} Dateien dieses Standes werden unwiderruflich gelöscht.`,
      confirmLabel: unvollstaendig ? 'Aufräumen' : 'Löschen',
      danger: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/admin/projektablage/staende/${s.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Stand konnte nicht gelöscht werden.');
      return;
    }
    setStaende((prev) => prev.filter((x) => x.id !== s.id));
    if (aktiverStand?.id === s.id) setAktiverStand(null);
    toast.success(unvollstaendig ? 'Aufgeräumt.' : 'Stand gelöscht.');
    void ladeProjekte();
  }

  function toggleOrdner(pfad: string) {
    setOffeneOrdner((prev) => {
      const next = new Set(prev);
      if (next.has(pfad)) next.delete(pfad);
      else next.add(pfad);
      return next;
    });
  }

  const gefilterteDateien = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return dateien;
    return dateien.filter((d) => d.relPfad.toLowerCase().includes(q));
  }, [dateien, suche]);

  const baum = useMemo(() => baueBaum(gefilterteDateien), [gefilterteDateien]);

  // ============================================================
  // Rendering
  // ============================================================

  if (zugriffVerweigert) {
    return (
      <div style={{ color: 'var(--admin-text)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
          <PageHeader title="📦 Projektablage" />
          <EmptyState
            icon="🔒"
            title="Kein Zugriff"
            description="Die Projektablage ist dem Inhaber vorbehalten."
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: 'var(--admin-text)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
        <PageHeader
          title="📦 Projektablage"
          subtitle={
            aktivesProjekt
              ? undefined
              : 'Privater Speicher für Projektstände — gehört nicht zum Verleih.'
          }
          actions={
            !aktivesProjekt ? (
              <Button onClick={() => setNeuOffen(true)}>+ Neues Projekt</Button>
            ) : undefined
          }
        />

        {migrationOffen && (
          <Card>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--admin-text-2)' }}>
              <strong style={{ color: 'var(--admin-danger)' }}>Migration ausstehend.</strong>{' '}
              Bitte <code>supabase/supabase-projektablage.sql</code> in Supabase ausführen —
              bis dahin lässt sich hier nichts speichern.
            </p>
          </Card>
        )}

        {/* ---------- Ansicht 1: Projektliste ---------- */}
        {!aktivesProjekt && (
          <>
            {laden ? (
              <Skeleton style={{ height: 120 }} />
            ) : projekte.length === 0 ? (
              <EmptyState
                icon="📦"
                title="Noch kein Projekt"
                description="Lege ein Projekt an und zieh dann deinen Projektordner hinein."
                action={<Button onClick={() => setNeuOffen(true)}>+ Neues Projekt</Button>}
              />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {projekte.map((p) => (
                  <Card key={p.id}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => oeffneProjekt(p)}
                        style={{
                          flex: 1, minWidth: 200, textAlign: 'left', background: 'transparent',
                          border: 'none', cursor: 'pointer', padding: 0, color: 'inherit',
                        }}
                      >
                        <h2 className="font-heading" style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--admin-heading)' }}>
                          {p.name}
                        </h2>
                        {p.beschreibung && (
                          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--admin-text-2)' }}>
                            {p.beschreibung}
                          </p>
                        )}
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--admin-text-dim)' }}>
                          {p.stand_anzahl === 0
                            ? 'Noch kein Stand hochgeladen'
                            : `${p.stand_anzahl} ${p.stand_anzahl === 1 ? 'Stand' : 'Stände'} · ${fmtBytes(p.bytes_gesamt)}`}
                          {p.letzter_stand_at && ` · zuletzt ${fmtDateTimeShort(p.letzter_stand_at)}`}
                        </p>
                      </button>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Button variant="secondary" size="sm" onClick={() => oeffneProjekt(p)}>
                          Öffnen
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => projektLoeschen(p)}>
                          Löschen
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------- Ansicht 2: Stände eines Projekts ---------- */}
        {aktivesProjekt && !aktiverStand && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <Button variant="ghost" size="sm" onClick={() => { setAktivesProjekt(null); void ladeProjekte(); }}>
                ← Alle Projekte
              </Button>
              <h2 className="font-heading" style={{ margin: 0, flex: 1, minWidth: 150, fontSize: 18, fontWeight: 700, color: 'var(--admin-heading)' }}>
                {aktivesProjekt.name}
              </h2>
              <Button onClick={() => setUploadOffen(true)}>+ Neuer Stand</Button>
            </div>

            {staendeLaden ? (
              <Skeleton style={{ height: 100 }} />
            ) : staende.length === 0 ? (
              <EmptyState
                icon="⬆"
                title="Noch kein Stand"
                description="Zieh deinen Projektordner hinein — die Struktur bleibt erhalten."
                action={<Button onClick={() => setUploadOffen(true)}>+ Neuer Stand</Button>}
              />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {staende.map((s) => {
                  const unvollstaendig = s.status !== 'fertig';
                  return (
                    <Card key={s.id}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', opacity: unvollstaendig ? 0.7 : 1 }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 15, color: 'var(--admin-heading)' }}>v{s.version_nr}</strong>
                            <span style={{ fontSize: 13, color: 'var(--admin-text-dim)' }}>
                              {fmtDateTimeShort(s.created_at)}
                            </span>
                            {unvollstaendig && (
                              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'rgba(217,119,6,0.15)', color: '#d97706' }}>
                                unvollständig
                              </span>
                            )}
                          </div>
                          {s.notiz && (
                            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--admin-text-2)' }}>{s.notiz}</p>
                          )}
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--admin-text-dim)' }}>
                            {s.datei_anzahl} Dateien · {fmtBytes(s.bytes_gesamt)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                          {!unvollstaendig && (
                            <>
                              <Button variant="secondary" size="sm" onClick={() => oeffneStand(s)}>
                                Dateien
                              </Button>
                              <a href={`/api/admin/projektablage/staende/${s.id}/zip`} style={{ textDecoration: 'none' }}>
                                <Button size="sm">⬇ Als ZIP</Button>
                              </a>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => standLoeschen(s)}>
                            {unvollstaendig ? 'Aufräumen' : 'Löschen'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ---------- Ansicht 3: Dateibaum eines Standes ---------- */}
        {aktivesProjekt && aktiverStand && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => setAktiverStand(null)}>
                ← Stände
              </Button>
              <h2 className="font-heading" style={{ margin: 0, flex: 1, minWidth: 150, fontSize: 18, fontWeight: 700, color: 'var(--admin-heading)' }}>
                {aktivesProjekt.name} · v{aktiverStand.version_nr}
              </h2>
              <a href={`/api/admin/projektablage/staende/${aktiverStand.id}/zip`} style={{ textDecoration: 'none' }}>
                <Button size="sm">⬇ Alles als ZIP</Button>
              </a>
            </div>

            <input
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Datei oder Ordner suchen …"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 16,
                marginBottom: 12, background: 'var(--admin-input-bg)', color: 'var(--admin-text)',
                border: '1px solid var(--admin-input-border)',
              }}
            />

            <Card>
              {dateienLaden ? (
                <Skeleton style={{ height: 200 }} />
              ) : gefilterteDateien.length === 0 ? (
                <p style={{ margin: 0, padding: '20px 0', textAlign: 'center', color: 'var(--admin-text-dim)' }}>
                  {suche ? 'Keine Treffer.' : 'Dieser Stand enthält keine Dateien.'}
                </p>
              ) : (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--admin-text-dim)' }}>
                    {gefilterteDateien.length} Dateien
                    {suche && ` (von ${dateien.length})`} · Klick lädt herunter
                  </p>
                  <OrdnerZeile ordner={baum} pfad="" offen={offeneOrdner} toggle={toggleOrdner} tiefe={0} />
                </>
              )}
            </Card>
          </>
        )}
      </div>

      {/* ---------- Neues Projekt ---------- */}
      {neuOffen && (
        <Modal
          open
          onClose={() => setNeuOffen(false)}
          title="Neues Projekt"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setNeuOffen(false)}>Abbrechen</Button>
              <Button onClick={projektAnlegen} loading={neuLaeuft} disabled={!neuName.trim()}>
                Anlegen
              </Button>
            </div>
          }
        >
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--admin-text-2)' }}>
            Name
          </label>
          <input
            value={neuName}
            onChange={(e) => setNeuName(e.target.value)}
            autoFocus
            placeholder="z.B. Kundenportal"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 16, marginBottom: 12,
              background: 'var(--admin-input-bg)', color: 'var(--admin-text)',
              border: '1px solid var(--admin-input-border)',
            }}
          />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--admin-text-2)' }}>
            Beschreibung (optional)
          </label>
          <textarea
            value={neuBeschreibung}
            onChange={(e) => setNeuBeschreibung(e.target.value)}
            rows={2}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
              background: 'var(--admin-input-bg)', color: 'var(--admin-text)',
              border: '1px solid var(--admin-input-border)', resize: 'vertical',
            }}
          />
        </Modal>
      )}

      {/* ---------- Upload ---------- */}
      {uploadOffen && aktivesProjekt && (
        <UploadDialog
          projektId={aktivesProjekt.id}
          projektName={aktivesProjekt.name}
          onClose={() => setUploadOffen(false)}
          onFertig={() => {
            void ladeStaende(aktivesProjekt.id);
            void ladeProjekte();
          }}
        />
      )}
    </div>
  );
}
