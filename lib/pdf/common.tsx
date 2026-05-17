/**
 * Gemeinsame PDF-Bausteine fuer die @react-pdf/renderer-Templates.
 *
 * Bewusst minimal: nur das Kamera-Logo-SVG + die zwei Marken-Farben, die
 * in ALLEN gebrandeten Templates byte-/pixel-identisch sind. Header-/Footer-
 * Balken werden NICHT zentralisiert, weil deren Style-Werte pro Template
 * abweichen (Balken-Hoehe, Page-Padding, Grauton) — eine erzwungene
 * Vereinheitlichung wuerde das Layout verschieben.
 *
 * Das schwarz/weisse Logo der Rechnung (lib/invoice-pdf.tsx) ist eine
 * bewusst eigenstaendige Variante und nutzt diesen Baustein NICHT.
 */
import { Svg, G, Rect, Circle } from '@react-pdf/renderer';

export const PDF_NAVY = '#0f172a';
export const PDF_CYAN = '#06b6d4';

/**
 * cam2rent-Kameraicon (Marken-Variante: Cyan-Body, Navy-Objektivring).
 * Geometrie + Farben identisch zu den bisherigen Inline-Kopien in
 * weekly-report / legal / haftungsbedingungen / packlist / contract.
 */
export function PdfLogo({ width = 38, height = 25 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 100">
      <G transform="translate(80, 50)">
        <Rect x={-40} y={-18} width={80} height={48} rx={6} fill={PDF_CYAN} />
        <Rect x={-22} y={-26} width={20} height={10} rx={2} fill={PDF_CYAN} />
        <Circle cx={0} cy={6} r={14} fill={PDF_NAVY} />
        <Circle cx={0} cy={6} r={9} fill={PDF_CYAN} />
        <Circle cx={26} cy={-10} r={2} fill="#ffffff" />
      </G>
    </Svg>
  );
}
