import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const feedbackLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 60 * 1000 }); // 10/h

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!feedbackLimiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, { status: 429 });
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Nachricht fehlt.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    user_email: user.email,
    message: message.trim(),
  });

  if (error) {
    console.error('Feedback insert error:', error);
    return NextResponse.json({ error: 'Feedback konnte nicht gespeichert werden.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
