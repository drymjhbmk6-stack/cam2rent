'use client';

interface CameraInfo {
  name: string;
  highlights: string[];
  tag?: string;
}

interface BlogVersusCardProps {
  camera1: CameraInfo;
  camera2: CameraInfo;
}

export default function BlogVersusCard({ camera1, camera2 }: BlogVersusCardProps) {
  return (
    <div className="my-8 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-0 rounded-xl overflow-hidden" style={{ background: '#1e293b' }}>
      {/* Kamera 1 */}
      <div className="p-5 sm:p-6" style={{ borderTop: '3px solid #06b6d4' }}>
        {camera1.tag && (
          <span className="text-[10px] font-heading font-bold uppercase tracking-wider mb-2 block" style={{ color: '#06b6d4' }}>{camera1.tag}</span>
        )}
        <h3 className="font-heading font-bold text-lg mb-3" style={{ color: '#06b6d4' }}>{camera1.name}</h3>
        <ul className="space-y-2">
          {camera1.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-body" style={{ color: '#e2e8f0' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold" style={{ background: 'rgba(6,182,212,0.2)', color: '#06b6d4' }}>✓</span>
              {h}
            </li>
          ))}
        </ul>
      </div>

      {/* VS Divider */}
      <div className="hidden sm:flex items-center justify-center px-3" style={{ background: '#111827' }}>
        <span className="font-heading font-black text-xl" style={{ color: '#475569' }}>VS</span>
      </div>
      <div className="sm:hidden flex justify-center py-2" style={{ background: '#111827' }}>
        <span className="font-heading font-black text-lg" style={{ color: '#475569' }}>VS</span>
      </div>

      {/* Kamera 2 */}
      <div className="p-5 sm:p-6" style={{ borderTop: '3px solid #8b5cf6' }}>
        {camera2.tag && (
          <span className="text-[10px] font-heading font-bold uppercase tracking-wider mb-2 block" style={{ color: '#8b5cf6' }}>{camera2.tag}</span>
        )}
        <h3 className="font-heading font-bold text-lg mb-3" style={{ color: '#8b5cf6' }}>{camera2.name}</h3>
        <ul className="space-y-2">
          {camera2.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-body" style={{ color: '#e2e8f0' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold" style={{ background: 'rgba(139,92,246,0.2)', color: '#8b5cf6' }}>✓</span>
              {h}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
