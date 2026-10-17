// Branding, typography and feature switches. This is the one file to edit to make the
// app your own — everything else reads from here.

export type SheetField =
  | 'numbers'   // 01, 02, … track numbers
  | 'colors'    // colour swatch + name (e.g. lighting cues)
  | 'bpm'       // tempo column
  | 'duration'  // per-track length
  | 'total'     // running total (cumulative time)
  | 'curve'     // the bpm/energy curve under the list
  | 'footer';   // date (left) + venue (right)

export const SHEET_FIELDS: SheetField[] = [
  'numbers', 'colors', 'bpm', 'duration', 'total', 'curve', 'footer',
];

export type SiteConfig = {
  /** Shown in the toolbar, the browser tab and the web manifest. */
  name: string;
  description: string;

  /**
   * Artwork at the top of the sheet. Put the file in /public and reference it with a
   * leading slash. Set to `null` to print `name` as a text heading instead.
   * `invertInDark` flips black artwork to white in the (screen-only) dark mode.
   */
  logo: { src: string; alt: string; invertInDark?: boolean } | null;

  /**
   * Typefaces. `stylesheet` is any CSS file that declares the families — a Google Fonts
   * URL, or a local file in /public (e.g. "/fonts/fonts.css" with @font-face rules).
   * It's loaded by both the page and the PDF renderer, so the PDF always matches.
   */
  fonts: {
    stylesheet?: string;
    /** Toolbar and buttons. */
    ui: string;
    /** Track names, colour names, date and venue on the sheet. */
    sheet: string;
    /** Track numbers, bpm and times. A tabular-figure font keeps columns aligned. */
    numbers: string;
  };

  /**
   * Which sheet fields exist at all. `true` = shown by default and can be hidden per
   * setlist from the editor; `false` = removed everywhere (no toggle is shown).
   */
  features: Record<SheetField, boolean>;

  /** Prefix for the edit cookie and browser-storage keys. */
  id: string;
  /** Postgres table that stores the setlists (letters, digits and _ only). */
  table: string;
};

const MONO = "'JetBrains Mono', ui-monospace, monospace";

export const siteConfig: SiteConfig = {
  name: 'setlist',
  description: 'Build, share and print gig setlists',

  // e.g. { src: '/logo.svg', alt: 'my band', invertInDark: true }
  logo: null,

  fonts: {
    stylesheet:
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap',
    ui: MONO,
    sheet: MONO,
    numbers: MONO,
  },

  features: {
    numbers: true,
    colors: true,
    bpm: true,
    duration: true,
    total: true,
    curve: true,
    footer: true,
  },

  id: 'setlist',
  table: 'setlists',
};
