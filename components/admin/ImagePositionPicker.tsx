'use client';

/**
 * 9-Punkt-Raster zum Positionieren eines Bild-Ausschnitts. Gibt einen CSS-
 * object-position-Wert zurueck ("0% 0%" bis "100% 100%"). Wird pro Plattform
 * (Facebook + Instagram) unabhaengig angewendet, damit der Admin IG-quadrat
 * und FB-landscape Crops getrennt steuern kann.
 */

const POSITIONS: Array<{ value: string; title: string }> = [
  { value: '0% 0%',     title: 'Oben links' },
  { value: '50% 0%',    title: 'Oben Mitte' },
  { value: '100% 0%',   title: 'Oben rechts' },
  { value: '0% 50%',    title: 'Mitte links' },
  { value: '50% 50%',   title: 'Mitte' },
  { value: '100% 50%',  title: 'Mitte rechts' },
  { value: '0% 100%',   title: 'Unten links' },
  { value: '50% 100%',  title: 'Unten Mitte' },
  { value: '100% 100%', title: 'Unten rechts' },
];

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export default function ImagePositionPicker({ label, value, onChange, disabled }: Props) {
  const current = value || '50% 50%';

  return (
    <div className="inline-flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="inline-grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-slate-900 border border-slate-800 w-fit">
        {POSITIONS.map((p) => {
          const active = p.value === current;
          return (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p.value)}
              title={p.title}
              className={`w-5 h-5 rounded transition ${
                active
                  ? 'bg-cyan-500 ring-1 ring-cyan-300'
                  : 'bg-slate-800 hover:bg-slate-700'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-label={p.title}
              aria-pressed={active}
            />
          );
        })}
      </div>
    </div>
  );
}
