'use client';

import { useEffect, useState } from 'react';

/**
 * Live-Status fuer laufende Reel-Renders.
 *
 * Parst den `render_log`-String (vom Orchestrator gepflegt via phaseLog),
 * ermittelt die aktuelle Phase, zeigt Gesamtdauer + Sekunden-seit-Update
 * und warnt phasen-spezifisch wenn der Render haengt.
 *
 * Wird nur angezeigt wenn status='rendering'. Bei allen anderen Stati
 * (rendered/pending_review/failed/...) rendert die Komponente null.
 */

interface PhaseEntry {
  time: string;       // 'HH:MM:SS' aus render_log
  phase: string;      // z.B. 'ffmpeg_start' oder 'stock_search:3/6'
  extra?: string;
}

type GroupStatus = 'done' | 'active' | 'pending' | 'failed';

interface PhaseGroup {
  id: string;
  label: string;
  emoji: string;
  startPhases: string[];          // Auftauchen → Gruppe ist mindestens 'active'
  endPhases: string[];            // Auftauchen → 'done'
  failPhases?: string[];          // Auftauchen → 'failed'
  stuckSeconds: number;           // Warnschwelle waehrend 'active'
}

const PHASE_GROUPS: PhaseGroup[] = [
  {
    id: 'script',
    label: 'Skript wird generiert (Claude)',
    emoji: '✍️',
    startPhases: ['script_generation_start', 'started'],
    endPhases: ['script_generated'],
    stuckSeconds: 180,
  },
  {
    id: 'stock',
    label: 'Stock-Footage wird gesucht',
    emoji: '🔍',
    startPhases: ['stock_search_start'],
    endPhases: ['stock_search_done'],
    stuckSeconds: 90,
  },
  {
    id: 'voice',
    label: 'Voice-Over wird erzeugt (TTS)',
    emoji: '🎙️',
    startPhases: ['voice_generation_start'],
    endPhases: ['voice_generation_done'],
    failPhases: ['voice_generation_failed'],
    stuckSeconds: 240,
  },
  {
    id: 'ffmpeg',
    label: 'Video wird gerendert (FFmpeg)',
    emoji: '🎬',
    startPhases: ['ffmpeg_start'],
    endPhases: ['ffmpeg_done'],
    stuckSeconds: 1800, // 30 min — FFmpeg-Phase darf lange schweigen
  },
  {
    id: 'upload',
    label: 'Video wird hochgeladen',
    emoji: '☁️',
    startPhases: ['video_upload_start'],
    endPhases: ['video_upload_done'],
    stuckSeconds: 180,
  },
  {
    id: 'segments',
    label: 'Szenen werden gespeichert',
    emoji: '💾',
    startPhases: ['segments_persist_start'],
    endPhases: ['segments_persisted'],
    failPhases: ['segments_persist_failed'],
    stuckSeconds: 180,
  },
  {
    id: 'finalize',
    label: 'DB-Update + Abschluss',
    emoji: '✅',
    startPhases: [],
    endPhases: ['render_complete'],
    failPhases: ['final_update_failed'],
    stuckSeconds: 60,
  },
];

/** Parst Zeilen wie '[phase 08:48:58] ffmpeg_done · 9.0 MB · 30.6s'. */
function parsePhaseLog(log: string): PhaseEntry[] {
  const entries: PhaseEntry[] = [];
  for (const line of log.split('\n')) {
    const m = line.match(/^\[phase (\d{2}:\d{2}:\d{2})\]\s+(\S+)(?:\s+·\s+(.*))?$/);
    if (m) entries.push({ time: m[1], phase: m[2], extra: m[3] });
  }
  return entries;
}

/** HH:MM:SS auf den heutigen UTC-Tag mappen. Bei Mitternachts-Crossing den Vortag.
 *
 * phaseLog im Orchestrator schreibt UTC: `new Date().toISOString().slice(11, 19)`.
 * Lokal-`setHours()` waere also tz-falsch — Date.UTC() ist Pflicht. */
function phaseTimeToDate(time: string, reference: Date): Date {
  const [h, m, s] = time.split(':').map(Number);
  const d = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
    h, m, s, 0,
  ));
  // Wenn die geparste Zeit deutlich nach 'reference' liegt → Vortag (UTC-basiert).
  if (d.getTime() - reference.getTime() > 60 * 60 * 1000) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function fmtDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ReelRenderStatusProps {
  status: string;
  renderLog: string | null;
  createdAt: string;
}

export default function ReelRenderStatus({ status, renderLog, createdAt }: ReelRenderStatusProps) {
  // Tick alle 1s, damit Sekunden-Counter laufen.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'rendering') return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  if (status !== 'rendering') return null;

  const entries = renderLog ? parsePhaseLog(renderLog) : [];
  const lastEntry = entries[entries.length - 1] ?? null;
  const now = new Date();

  // Gruppen-Status berechnen
  const phaseSet = new Set(entries.map((e) => e.phase));
  // stock_search:N/M wird als 'stock'-active behandelt
  const hasStockSearchProgress = entries.some((e) => e.phase.startsWith('stock_search:'));

  const groupStates: Array<{ group: PhaseGroup; status: GroupStatus; subInfo?: string }> = PHASE_GROUPS.map((group) => {
    if (group.failPhases?.some((p) => phaseSet.has(p))) {
      return { group, status: 'failed' as GroupStatus };
    }
    if (group.endPhases.some((p) => phaseSet.has(p))) {
      return { group, status: 'done' as GroupStatus };
    }
    if (group.startPhases.some((p) => phaseSet.has(p))) {
      // Sub-Info fuer Stock-Search: aktueller Fortschritt der Szenen
      let subInfo: string | undefined;
      if (group.id === 'stock' && hasStockSearchProgress) {
        const last = [...entries].reverse().find((e) => e.phase.startsWith('stock_search:'));
        if (last) subInfo = last.phase.replace('stock_search:', 'Szene ');
      }
      return { group, status: 'active' as GroupStatus, subInfo };
    }
    return { group, status: 'pending' as GroupStatus };
  });

  // Aktive Gruppe = die letzte aktive (oder die erste pending, falls keine aktive).
  const activeIdx = groupStates.findIndex((s) => s.status === 'active');
  const activeGroup = activeIdx >= 0 ? groupStates[activeIdx] : null;

  // Render-Start: bei Re-Renders ist created_at veraltet, deshalb bevorzugt
  // den juengsten 'started'-Phaseneintrag verwenden (Orchestrator emittiert
  // ihn als ersten Schritt).
  let totalElapsedSec = (now.getTime() - new Date(createdAt).getTime()) / 1000;
  const startedEntry = [...entries].reverse().find((e) => e.phase === 'started');
  if (startedEntry) {
    const startedDate = phaseTimeToDate(startedEntry.time, now);
    const fromStarted = (now.getTime() - startedDate.getTime()) / 1000;
    if (fromStarted >= 0 && fromStarted < totalElapsedSec) {
      totalElapsedSec = fromStarted;
    }
  }

  // Sekunden seit letztem Log-Update
  let sinceUpdateSec = totalElapsedSec;
  if (lastEntry) {
    const lastDate = phaseTimeToDate(lastEntry.time, now);
    sinceUpdateSec = (now.getTime() - lastDate.getTime()) / 1000;
  }

  // Stuck-Detection: Schwelle der aktuellen Gruppe (Default 90s)
  const threshold = activeGroup?.group.stuckSeconds ?? 90;
  const isWarn = sinceUpdateSec > threshold * 0.7;
  const isStuck = sinceUpdateSec > threshold;

  // Farben
  const borderColor = isStuck
    ? 'border-red-300 dark:border-red-800'
    : isWarn
      ? 'border-amber-300 dark:border-amber-800'
      : 'border-cyan-300 dark:border-cyan-800';
  const bgColor = isStuck
    ? 'bg-red-50 dark:bg-red-950/30'
    : isWarn
      ? 'bg-amber-50 dark:bg-amber-950/30'
      : 'bg-cyan-50 dark:bg-cyan-950/30';
  const headlineColor = isStuck
    ? 'text-red-900 dark:text-red-200'
    : isWarn
      ? 'text-amber-900 dark:text-amber-200'
      : 'text-cyan-900 dark:text-cyan-200';
  const sinceColor = isStuck
    ? 'text-red-700 dark:text-red-300'
    : isWarn
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-cyan-700 dark:text-cyan-300';

  const headlineText = isStuck
    ? 'Render hängt vermutlich'
    : isWarn
      ? 'Render läuft, aber ungewöhnlich langsam'
      : activeGroup
        ? `${activeGroup.group.emoji} ${activeGroup.group.label}`
        : '🎬 Render läuft …';

  const completedCount = groupStates.filter((s) => s.status === 'done').length;
  const totalCount = groupStates.length;

  return (
    <div className={`mb-4 rounded-lg border-2 ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className={`font-semibold ${headlineColor} flex items-center gap-2`}>
            {!isStuck && !isWarn && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <span className="truncate">{headlineText}</span>
          </div>
          {activeGroup?.subInfo && (
            <div className="text-xs text-brand-steel dark:text-gray-400 mt-1">{activeGroup.subInfo}</div>
          )}
          {lastEntry && (
            <div className="text-xs text-brand-steel dark:text-gray-400 mt-1 font-mono">
              Letzter Log-Eintrag: <span className="font-semibold">{lastEntry.phase}</span>
              {lastEntry.extra ? ` · ${lastEntry.extra}` : ''}
            </div>
          )}
        </div>
        <div className="text-right text-xs space-y-0.5 shrink-0">
          <div className={headlineColor}>
            <span className="text-brand-steel dark:text-gray-400">Gesamt: </span>
            <span className="font-mono font-semibold">{fmtDuration(totalElapsedSec)}</span>
          </div>
          <div className={sinceColor}>
            <span className="text-brand-steel dark:text-gray-400">Seit Update: </span>
            <span className="font-mono font-semibold">{fmtDuration(sinceUpdateSec)}</span>
            <span className="text-brand-steel dark:text-gray-400"> / {threshold}s</span>
          </div>
          <div className="text-brand-steel dark:text-gray-400">
            Phase {Math.min(completedCount + 1, totalCount)} von {totalCount}
          </div>
        </div>
      </div>

      {isStuck && (
        <div className="mt-3 text-xs text-red-800 dark:text-red-200">
          Schwellwert für diese Phase überschritten — der Worker antwortet nicht mehr. Wenn die Anzeige in den
          nächsten Minuten nicht weiterläuft: <strong>&bdquo;🛑 Render abbrechen&ldquo;</strong> klicken und neu starten.
        </div>
      )}

      {/* Phasen-Timeline */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {groupStates.map(({ group, status: gStatus }) => {
          const styles = {
            done: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-800',
            active: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-900 dark:text-cyan-100 border-cyan-400 dark:border-cyan-700 ring-2 ring-cyan-300 dark:ring-cyan-700',
            pending: 'bg-gray-50 dark:bg-gray-900/40 text-brand-steel dark:text-gray-500 border-gray-200 dark:border-gray-800',
            failed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800',
          }[gStatus];
          const icon = gStatus === 'done' ? '✓' : gStatus === 'failed' ? '✗' : gStatus === 'active' ? group.emoji : '○';
          return (
            <div key={group.id} className={`rounded-md border px-2 py-1.5 text-[11px] ${styles}`}>
              <div className="flex items-center gap-1">
                <span>{icon}</span>
                <span className="truncate font-medium">{group.label.split(' ')[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
