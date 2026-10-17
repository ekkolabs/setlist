import type { SheetField } from '@/site.config';

export type ColorName =
  | 'cyan'
  | 'red'
  | 'white'
  | 'amber'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'rainbow'
  | 'amber/cyan';

export type Song = {
  name: string;
  color: ColorName;
  bpm: string;
  duration: string; // "mm:ss"
  hidden?: boolean; // excluded from the printed sheet, the running clock, and the curve
};

export type Setlist = {
  id: string;
  name: string; // organizational title (not shown on the printed sheet)
  slug: string; // human-readable URL segment, derived from `name` (see normalizeDoc)
  date: string; // footer left
  venue: string; // footer right
  hide?: Partial<Record<SheetField, boolean>>; // fields hidden on this sheet (and its PDF)
  hideColors?: boolean; // legacy, folded into `hide.colors` by normalizeDoc
  songs: Song[];
};

export type Doc = {
  lists: Setlist[];
  currentId: string; // the list served at "/" — i.e. the public "current" setlist
};
