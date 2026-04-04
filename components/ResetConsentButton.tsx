'use client';

export default function ResetConsentButton() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem('cam2rent_consent');
        localStorage.removeItem('cam2rent_tracking_optout');
        window.location.reload();
      }}
      className="px-5 py-2.5 text-sm font-body font-medium text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
    >
      Cookie-Einstellungen zurücksetzen
    </button>
  );
}
