import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { type Browser } from 'puppeteer-core';
import { getDoc } from '@/lib/db';
import { renderSheetHTML } from '@/lib/render';
import { pdfFilename } from '@/lib/setlist';
import type { Setlist } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function launch(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: use an installed Chrome.
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH || mac,
    headless: true,
    args: ['--no-sandbox'],
  });
}

async function makePdf(setlist: Setlist, origin: string): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(renderSheetHTML(setlist, origin), { waitUntil: 'load' });
    // Ensure the logo image and web fonts are fully ready before measuring/printing.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }),
        ),
      );
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
    });
    // Scale #sheet to fit one A4 page, centered.
    await page.evaluate(() => {
      const box = document.getElementById('page')!;
      const sheet = document.getElementById('sheet')!;
      const margin = 28;
      const scale = Math.min(
        (box.clientWidth - 2 * margin) / sheet.offsetWidth,
        (box.clientHeight - 2 * margin) / sheet.offsetHeight,
      );
      sheet.style.transform = 'scale(' + scale + ')';
    });
    const pdf = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      pageRanges: '1',
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

function currentSetlist(doc: { lists: Setlist[]; currentId: string }): Setlist | undefined {
  return doc.lists.find((l) => l.id === doc.currentId) || doc.lists[0];
}

function pdfResponse(pdf: Uint8Array, filename: string): NextResponse {
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// GET: render a setlist straight from the database (shareable link).
// "?slug=<slug>" picks a specific one; without it you get the current setlist.
export async function GET(req: NextRequest) {
  try {
    const doc = await getDoc();
    const slug = req.nextUrl.searchParams.get('slug');
    const sl = slug ? doc.lists.find((l) => l.slug === slug) : currentSetlist(doc);
    if (!sl) return NextResponse.json({ error: 'no_setlist' }, { status: 404 });
    return pdfResponse(await makePdf(sl, req.nextUrl.origin), pdfFilename(sl.name));
  } catch (e) {
    console.error('pdf GET failed', e);
    return NextResponse.json({ error: 'pdf_failed' }, { status: 500 });
  }
}

// POST: render an explicit setlist (used by the editor so the PDF matches unsaved edits).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sl = body?.setlist as Setlist | undefined;
    if (!sl || !Array.isArray(sl.songs)) {
      return NextResponse.json({ error: 'bad_shape' }, { status: 400 });
    }
    return pdfResponse(await makePdf(sl, req.nextUrl.origin), pdfFilename(sl.name));
  } catch (e) {
    console.error('pdf POST failed', e);
    return NextResponse.json({ error: 'pdf_failed' }, { status: 500 });
  }
}
