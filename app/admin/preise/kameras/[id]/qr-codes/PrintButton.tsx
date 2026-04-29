'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 bg-cyan-600 text-white rounded font-semibold text-sm hover:bg-cyan-700 transition-colors"
    >
      Drucken
    </button>
  );
}
