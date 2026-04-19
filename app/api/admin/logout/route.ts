import { NextResponse } from 'next/server';

/**
 * POST /api/admin/logout
 * Löscht das admin_token Cookie.
 */
export async function POST() {
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
