import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, issueToken, isValidToken, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Report whether the current request already carries a valid edit session.
export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: isValidToken(req.cookies.get(COOKIE_NAME)?.value) });
}

// Exchange the password for an edit-session cookie.
export async function POST(req: NextRequest) {
  let password = '';
  try {
    const body = await req.json();
    password = String(body?.password ?? '');
  } catch {
    /* ignore */
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, issueToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}

// Log out of the edit session.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
