'use client';

interface SpecRow {
  feature: string;
  values: (string | { value: string; winner?: boolean; badge?: string })[];
}

interface BlogSpecsTableProps {
  headers: string[];
  rows: SpecRow[];
}

export default function BlogSpecsTable({ headers, rows }: BlogSpecsTableProps) {
  return (
    <div className="my-8 rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid rgba(6,182,212,0.12)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#111827' }}>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: i === 0 ? '#94a3b8' : '#e2e8f0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="transition-colors hover:bg-white/[0.03]" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td className="px-4 py-3 font-body font-medium" style={{ color: '#94a3b8' }}>
                  {row.feature}
                </td>
                {row.values.map((val, vi) => {
                  const isObj = typeof val === 'object';
                  const text = isObj ? val.value : val;
                  const winner = isObj && val.winner;
                  const badge = isObj ? val.badge : undefined;
                  return (
                    <td key={vi} className="px-4 py-3 font-body" style={{ color: winner ? '#06b6d4' : '#e2e8f0' }}>
                      <span className={winner ? 'font-semibold' : ''}>{text}</span>
                      {badge && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-heading font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                          {badge}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
