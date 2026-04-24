import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { deleteSession, isSessionToken } from '@/lib/admin-users';

/**
 * POST /api/admin/logout
 * Loescht das admin_token Cookie. Bei Session-Tokens wird zusaetzlich der
 * Eintrag in admin_sessions entfernt.
 */
export async function POST() {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (token && isSessionToken(token)) {
    await deleteSession(token).catch(() => {});
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
