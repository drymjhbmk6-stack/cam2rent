'use client';

import { useState } from 'react';

interface ExportButtonProps {
  label: string;
  onClick: () => Promise<void>;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export default function ExportButton({ label, onClick, disabled = false, variant = 'secondary' }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  }

  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={handleClick}
      disabled={loading || disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 13,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: loading || disabled ? 0.5 : 1,
        background: isPrimary ? '#06b6d4' : 'transparent',
        color: isPrimary ? '#0f172a' : '#06b6d4',
        border: isPrimary ? 'none' : '1px solid #06b6d4',
        transition: 'opacity 0.15s',
      }}
    >
      {loading ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
          <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
      {loading ? 'Exportiere...' : label}
    </button>
  );
}
