'use client';

import { useState } from 'react';

/**
 * Schwebender Beta-Feedback Button — immer sichtbar, unabhaengig vom Banner.
 * Kann ueber admin_settings (show_feedback_button) gesteuert werden.
 */
export default function BetaFeedbackButton() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 animate-fade-in">
      <div className="relative">
        <a
          href="/beta-feedback"
          className="flex items-center gap-2 px-4 py-2.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-full shadow-lg shadow-accent-blue/30 hover:bg-blue-700 transition-all hover:scale-105"
        >
          <span className="text-base">💬</span>
          Feedback geben
        </a>
        <button
          onClick={(e) => { e.preventDefault(); setDismissed(true); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-black text-white text-[10px] flex items-center justify-center hover:bg-gray-700 transition-colors"
          aria-label="Schliessen"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
