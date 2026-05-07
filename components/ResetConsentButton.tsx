'use client';

export default function ResetConsentButton() {
  return (
    <button
      onClick={() => {
        // Sweep 9: bei Widerruf Art. 7 Abs. 3 DSGVO ALLE pseudonymen Tracking-IDs
        // entfernen. Vorher blieben cam2rent_vid + cam2rent_sid erhalten —
        // Re-Consent waere damit an alte Sessions korreliert.
        localStorage.removeItem('cam2rent_consent');
        localStorage.removeItem('cam2rent_tracking_optout');
        localStorage.removeItem('cam2rent_vid');
        sessionStorage.removeItem('cam2rent_sid');
        window.location.reload();
      }}
      className="px-5 py-2.5 text-sm font-body font-medium text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
    >
      Cookie-Einstellungen zurücksetzen
    </button>
  );
}
