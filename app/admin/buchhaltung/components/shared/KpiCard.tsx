'use client';

interface KpiCardProps {
  label: string;
  value: string;
  trend?: number; // prozentuale Änderung
  subtitle?: string;
  onClick?: () => void;
  accentColor?: string;
}

export default function KpiCard({ label, value, trend, subtitle, onClick, accentColor = '#06b6d4' }: KpiCardProps) {
  const trendColor = trend === undefined || trend === 0
    ? '#64748b'
    : trend > 0 ? '#10b981' : '#ef4444';
  const trendIcon = trend === undefined || trend === 0
    ? '▬'
    : trend > 0 ? '▲' : '▼';

  return (
    <button
      onClick={onClick}
      className="text-left w-full"
      style={{
        background: '#111827',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '20px 24px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = accentColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0', lineHeight: 1.1 }}>
        {value}
      </div>
      {(trend !== undefined || subtitle) && (
        <div style={{ marginTop: 8, fontSize: 13, color: trendColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          {trend !== undefined && (
            <>
              <span>{trendIcon}</span>
              <span>{Math.abs(trend).toFixed(1)} %</span>
            </>
          )}
          {subtitle && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: trend !== undefined ? 8 : 0 }}>{subtitle}</span>}
        </div>
      )}
    </button>
  );
}
