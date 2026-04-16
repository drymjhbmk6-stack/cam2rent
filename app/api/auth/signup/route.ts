import { NextResponse } from 'next/server';

/**
 * Registrierungs-Rate-Limiter
 * Supabase Free Tier: max 4 Signups pro Stunde
 * Wir limitieren auf 3, um Puffer zu haben.
 */
const MAX_SIGNUPS_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 Stunde

const signupTimestamps: number[] = [];

function cleanOldEntries() {
  const cutoff = Date.now() - WINDOW_MS;
  while (signupTimestamps.length > 0 && signupTimestamps[0] < cutoff) {
    signupTimestamps.shift();
  }
}

function getSecondsUntilReset(): number {
  if (signupTimestamps.length === 0) return 0;
  const oldest = signupTimestamps[0];
  const resetAt = oldest + WINDOW_MS;
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}

/**
 * GET /api/auth/signup
 * Prüft ob Registrierung aktuell möglich ist
 */
export async function GET() {
  cleanOldEntries();
  const remaining = MAX_SIGNUPS_PER_HOUR - signupTimestamps.length;
  return NextResponse.json({
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    resetInSeconds: remaining <= 0 ? getSecondsUntilReset() : 0,
  });
}

/**
 * POST /api/auth/signup
 * Wird NACH erfolgreicher Supabase-Registrierung aufgerufen, um den Zähler zu erhöhen.
 * Wird VOR der Registrierung aufgerufen mit ?check=1 um das Limit zu prüfen.
 */
export async function POST() {
  cleanOldEntries();

  if (signupTimestamps.length >= MAX_SIGNUPS_PER_HOUR) {
    const resetIn = getSecondsUntilReset();
    const minutes = Math.ceil(resetIn / 60);
    return NextResponse.json({
      error: `Aktuell sind zu viele Registrierungen eingegangen. Bitte versuche es in ${minutes} Minuten erneut.`,
      rateLimited: true,
      resetInSeconds: resetIn,
    }, { status: 429 });
  }

  // Zähler erhöhen
  signupTimestamps.push(Date.now());
  const remaining = MAX_SIGNUPS_PER_HOUR - signupTimestamps.length;

  return NextResponse.json({
    success: true,
    remaining: Math.max(0, remaining),
  });
}
