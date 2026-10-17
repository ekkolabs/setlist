import { NextRequest, NextResponse } from 'next/server';
import { getDoc, saveDoc } from '@/lib/db';
import { isValidToken, COOKIE_NAME } from '@/lib/auth';
import type { Doc } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const doc = await getDoc();
    return NextResponse.json(doc);
  } catch (e) {
    return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isValidToken(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let doc: Doc;
  try {
    doc = (await req.json()) as Doc;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  if (!doc || !Array.isArray(doc.lists) || typeof doc.currentId !== 'string') {
    return NextResponse.json({ ok: false, error: 'bad_shape' }, { status: 400 });
  }

  try {
    await saveDoc(doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'db_unavailable' }, { status: 503 });
  }
}
