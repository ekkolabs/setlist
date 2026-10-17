import type { CSSProperties } from 'react';
import type { ColorName, Doc, Setlist, Song } from './types';
import { SHEET_FIELDS, siteConfig, type SheetField } from '@/site.config';

export type Visible = Record<SheetField, boolean>;

// What the sheet actually shows: a field must be enabled site-wide (site.config.ts) and
// not hidden on this particular setlist.
export function visibleFields(sl?: Pick<Setlist, 'hide' | 'hideColors'>): Visible {
  const v = {} as Visible;
  for (const f of SHEET_FIELDS) {
    const hidden = sl?.hide?.[f] ?? (f === 'colors' && !!sl?.hideColors);
    v[f] = siteConfig.features[f] && !hidden;
  }
  return v;
}

export const RAINBOW =
  'linear-gradient(90deg,#ff2d2d,#ff9d00,#f4e000,#17d613,#1fe3e3,#1414ff,#a11fe0)';

// Two-tone combo: hard 50/50 split rather than a blend, so both colours read clearly.
export const AMBER_CYAN = 'linear-gradient(90deg,#ff9d00 0 50%,#1fe3e3 50% 100%)';

// `gradient` wins over `bg` when present (rainbow + combo swatches).
export const COLORS: Record<string, { bg?: string; gradient?: string }> = {
  cyan: { bg: '#1fe3e3' },
  red: { bg: '#ff1111' },
  white: { bg: '#ffffff' },
  amber: { bg: '#ff9d00' },
  green: { bg: '#17d613' },
  blue: { bg: '#1414ff' },
  purple: { bg: '#a11fe0' },
  pink: { bg: '#ff2d95' },
  rainbow: { gradient: RAINBOW },
  'amber/cyan': { gradient: AMBER_CYAN },
};

export const COLOR_LIST: ColorName[] = [
  'cyan', 'red', 'white', 'amber', 'green', 'blue', 'purple', 'pink',
  'rainbow', 'amber/cyan',
];

// Discrete stops for the PDF renderer: Chromium's print pipeline doesn't rasterize CSS
// gradients reliably (they collapse to the first stop), so gradient swatches are drawn
// as solid stripes there. Keyed identically to COLORS' `gradient` entries.
export const GRADIENT_STOPS: Record<string, string[]> = {
  rainbow: ['#ff2d2d', '#ff9d00', '#f4e000', '#17d613', '#1fe3e3', '#1414ff', '#a11fe0'],
  'amber/cyan': ['#ff9d00', '#1fe3e3'],
};

// Width of the right-hand bpm / duration / total block, by how many of them are shown.
const NUM_BLOCK = [0, 80, 172, 268];

// Sheet grid columns, shared by the on-screen sheet and the PDF renderer so the two can
// never drift. The name column takes whatever is left, so hiding the numbers or colour
// column widens the names while the bpm / duration / total block stays put on the right.
export function sheetCols(v: Visible): string {
  const cols: string[] = [];
  if (v.numbers) cols.push('40px');
  cols.push('1fr');
  if (v.colors) cols.push('171px');
  const n = numericCount(v);
  if (n) cols.push(NUM_BLOCK[n] + 'px');
  return cols.join(' ');
}

export function numericCount(v: Visible): number {
  return Number(v.bpm) + Number(v.duration) + Number(v.total);
}

export function toSec(d: string): number {
  if (!d) return 0;
  const p = String(d).split(':');
  if (p.length === 2) return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  return parseInt(p[0], 10) || 0;
}

export function fmt(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Step curve: a flat plateau per song (constant bpm), each song's WIDTH proportional
// to its duration, joined by short rounded transitions.
export function buildCurve(songs: Song[]): string {
  if (!songs.length) return '';
  const W = 1000, H = 120, pad = 14;
  const secs = songs.map((s) => toSec(s.duration) || 1);
  const total = secs.reduce((a, b) => a + b, 0) || 1;
  const bpms = songs.map((s) => parseInt(s.bpm, 10) || 0);
  const lo = Math.min(...bpms), hi = Math.max(...bpms);
  const span = hi - lo || 1;
  const y = (b: number) => H - pad - ((b - lo) / span) * (H - 2 * pad);
  const bounds = [0];
  let acc = 0;
  for (let i = 0; i < secs.length; i++) {
    acc += secs[i];
    bounds.push((acc / total) * W);
  }
  let d = 'M 0 ' + y(bpms[0]).toFixed(1);
  for (let i = 0; i < songs.length; i++) {
    const x1 = bounds[i + 1], seg = x1 - bounds[i];
    const r = Math.min(30, seg * 0.5);
    const yi = y(bpms[i]);
    if (i < songs.length - 1) {
      const yn = y(bpms[i + 1]);
      const rn = Math.min(30, (bounds[i + 2] - x1) * 0.5);
      d += ' L ' + (x1 - r).toFixed(1) + ' ' + yi.toFixed(1);
      d += ' C ' + x1.toFixed(1) + ' ' + yi.toFixed(1) + ' ' + x1.toFixed(1) + ' ' +
        yn.toFixed(1) + ' ' + (x1 + rn).toFixed(1) + ' ' + yn.toFixed(1);
    } else {
      d += ' L ' + x1.toFixed(1) + ' ' + yi.toFixed(1);
    }
  }
  return d;
}

export function swatchStyle(color: string): CSSProperties {
  const c = COLORS[color] || COLORS.white;
  const base: CSSProperties = {
    width: 20, height: 20, flex: '0 0 auto', display: 'inline-block',
    border: '1.5px solid #111', boxSizing: 'border-box',
  };
  return { ...base, background: c.gradient ?? c.bg };
}

export function newId(): string {
  return 'sl_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
}

// URL-safe, human-readable segment, e.g. "20260801 The Venue" -> "20260801-the-venue".
export function slugify(name: string | undefined): string {
  return (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Slugs are *derived* from the names, never hand-edited, so this is deterministic: the
// client and the server always agree on the URLs without having to sync an extra field.
// Duplicate names get a -2, -3, … suffix in list order.
export function normalizeDoc(doc: Doc): Doc {
  const taken = new Set<string>();
  const lists = doc.lists.map((l) => {
    const base = slugify(l.name) || 'setlist';
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    let out = l.slug === slug ? l : { ...l, slug };
    // Fold the old single-purpose flag into the per-field map.
    if (out.hideColors !== undefined) {
      const { hideColors, ...rest } = out;
      out = { ...rest, hide: { colors: hideColors, ...rest.hide } };
    }
    return out;
  });
  const currentId = lists.some((l) => l.id === doc.currentId)
    ? doc.currentId
    : lists[0]?.id || '';
  return { lists, currentId };
}

// Safe download filename derived from the setlist name, e.g. "20260801 venue" -> "20260801_venue.pdf".
export function pdfFilename(name: string | undefined): string {
  const base = (name || 'setlist')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (base || 'setlist') + '.pdf';
}

function defaultSongs(): Song[] {
  const raw: [string, ColorName, number, string][] = [
    ['intro', 'white', 110, '02:10'], ['opener', 'cyan', 122, '04:05'],
    ['second song', 'red', 124, '03:48'], ['the slow one', 'blue', 96, '05:12'],
    ['crowd favourite', 'amber', 126, '04:20'], ['new single', 'green', 128, '03:35'],
    ['long jam', 'purple', 124, '07:02'], ['peak', 'rainbow', 130, '04:44'],
    ['encore', 'amber/cyan', 120, '05:30'],
  ];
  return raw.map((r) => ({ name: r[0], color: r[1], bpm: String(r[2]), duration: r[3] }));
}

export function defaultDoc(): Doc {
  const list: Setlist = {
    id: 'sl_default',
    name: 'example setlist',
    slug: '',
    date: 'saturday, 1 august',
    venue: 'the venue, somewhere',
    songs: defaultSongs(),
  };
  return normalizeDoc({ lists: [list], currentId: list.id });
}
