import type { Setlist } from './types';
import { COLORS, GRADIENT_STOPS, buildCurve, fmt, numericCount, sheetCols, toSec, visibleFields, type Visible } from './setlist';
import { siteConfig } from '@/site.config';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function swatch(color: string): string {
  const base = 'width:20px;height:20px;flex:0 0 auto;border:1.5px solid #111;box-sizing:border-box;';
  // Solid stripes instead of a CSS gradient — gradients don't reliably rasterize in the
  // Chromium print pipeline (they collapse to the first stop = red).
  const stops = GRADIENT_STOPS[color];
  if (stops) {
    const stripes = stops.map((c) => `<span style="flex:1;background:${c};"></span>`).join('');
    return `<span style="${base}display:flex;overflow:hidden;">${stripes}</span>`;
  }
  const c = COLORS[color] || COLORS.white;
  return `<span style="${base}display:inline-block;background:${c.bg};"></span>`;
}

function rowHtml(s: Setlist['songs'][number], i: number, cum: string, v: Visible): string {
  // Mirror the on-screen read-only row EXACTLY: the shared sheetCols() grid, whose last
  // cell is a flex `space-between` container holding bpm, duration and total.
  const text = 'font-size:23px;font-weight:700;color:#000;';
  const numCell = 'font-family:var(--font-numbers);' + text;
  const numCell2 = numCell + 'letter-spacing:-0.02em;';
  const cells: string[] = [];
  if (v.numbers) cells.push(`<span style="${numCell2}">${String(i + 1).padStart(2, '0')}</span>`);
  cells.push(`<span style="display:block;width:100%;${text}text-transform:lowercase;padding:2px 0;white-space:pre-wrap;">${esc(s.name)}</span>`);
  if (v.colors) {
    cells.push(`<span style="display:flex;align-items:center;gap:10px;">${swatch(s.color)}<span style="${text}text-transform:lowercase;">${esc(s.color)}</span></span>`);
  }
  if (numericCount(v)) {
    const nums: string[] = [];
    if (v.bpm) nums.push(`<span style="${numCell}">${esc(s.bpm)}</span>`);
    if (v.duration) nums.push(`<span style="${numCell}">${esc(s.duration)}</span>`);
    if (v.total) nums.push(`<span style="${numCell}">${cum}</span>`);
    cells.push(`<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">${nums.join('')}</div>`);
  }
  return `<div style="display:grid;grid-template-columns:${sheetCols(v)};gap:16px;align-items:center;font-weight:700;font-size:23px;">${cells.join('')}</div>`;
}

function absolute(url: string, origin: string): string {
  return url.startsWith('/') ? origin + url : url;
}

// A self-contained HTML document for the setlist sheet, sized 920px. The PDF route
// scales #sheet to fit exactly one A4 page (#page). `origin` is used to load the logo
// and fonts over the network so the PDF is byte-identical to the on-screen sheet.
export function renderSheetHTML(setlist: Setlist, origin: string): string {
  const songs = setlist.songs.filter((s) => !s.hidden);
  const v = visibleFields(setlist);
  let run = 0;
  const rows = songs
    .map((s, i) => {
      run += toSec(s.duration);
      return rowHtml(s, i, fmt(run), v);
    })
    .join('');
  const curve = buildCurve(songs);
  const { fonts, logo } = siteConfig;
  const fontLink = fonts.stylesheet
    ? `<link href="${esc(absolute(fonts.stylesheet, origin))}" rel="stylesheet">`
    : '';
  const heading = logo
    ? `<img src="${esc(absolute(logo.src, origin))}" alt="${esc(logo.alt)}" style="display:block;width:100%;height:auto;" />`
    : `<div style="font-size:64px;font-weight:800;line-height:1;letter-spacing:-0.03em;color:#000;text-transform:lowercase;">${esc(siteConfig.name)}</div>`;
  const curveHtml = v.curve ? `
      <div style="margin-top:30px;">
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none" style="display:block;width:100%;height:110px;overflow:visible;">
          <path d="${curve}" fill="none" stroke="#000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        </svg>
      </div>` : '';
  const footerHtml = v.footer ? `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:26px;">
        <span style="font-size:23px;font-weight:700;color:#000;text-transform:lowercase;padding:2px 2px;flex:0 0 auto;width:44%;">${esc(setlist.date)}</span>
        <span style="font-size:23px;font-weight:700;color:#000;text-transform:lowercase;text-align:right;padding:2px 2px;flex:1;">${esc(setlist.venue)}</span>
      </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${fontLink}
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  :root { --font-sheet: ${fonts.sheet}; --font-numbers: ${fonts.numbers}; }
  html, body { margin:0; padding:0; background:#fff; font-family:var(--font-sheet); font-variant-numeric: tabular-nums; font-feature-settings:"tnum" 1; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  #page { width:210mm; height:297mm; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  /* flex-shrink:0 is essential: #sheet is a flex child of #page (which is only ~794px / A4
     wide), so without it the 920px sheet gets squeezed to fit BEFORE the transform scales it,
     collapsing the 1fr column and bunching the bpm/duration/cum numbers. */
  #sheet { width:920px; flex:0 0 auto; background:#fff; padding:56px 64px 48px; transform-origin:center center; }
</style>
</head>
<body>
  <div id="page">
    <div id="sheet">
      ${heading}
      <div style="height:34px;"></div>
      <div style="display:flex;flex-direction:column;gap:8px;">${rows}</div>${curveHtml}${footerHtml}
    </div>
  </div>
</body>
</html>`;
}
