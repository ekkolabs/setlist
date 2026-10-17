'use client';

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ColorName, Doc, Setlist } from '@/lib/types';
import {
  COLOR_LIST,
  buildCurve,
  fmt,
  toSec,
  swatchStyle,
  defaultDoc,
  newId,
  normalizeDoc,
  pdfFilename,
  sheetCols,
  numericCount,
  visibleFields,
} from '@/lib/setlist';
import { SHEET_FIELDS, siteConfig, type SheetField } from '@/site.config';

const THEME_KEY = `${siteConfig.id}-theme`;
// Fields the editor can toggle per setlist: only those enabled site-wide.
const TOGGLES = SHEET_FIELDS.filter((f) => siteConfig.features[f]);
const CURVE_THICKNESS = 5.5;

const inputBase: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: '2px 0',
  margin: 0,
  fontSize: 23,
  fontWeight: 700,
  color: '#000',
  width: '100%',
};

const svgProps = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const EyeIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svgProps}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svgProps}>
    <path d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9m3.8-1.9A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2m-6.7-1.1a3 3 0 1 1-4.2-4.2" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const MoonIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svgProps}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const SunIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svgProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </svg>
);
const CopyIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" {...svgProps}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export default function SetlistApp(
  { initialDoc, initialSlug }: { initialDoc: Doc | null; initialSlug?: string },
) {
  const [doc, setDoc] = useState<Doc>(initialDoc ?? defaultDoc());
  // Which setlist is on screen. Deliberately separate from doc.currentId (the one the
  // public "/" serves) so you can browse and edit a setlist without publishing it.
  const [viewId, setViewId] = useState<string>(() => {
    const d = initialDoc ?? defaultDoc();
    const bySlug = initialSlug && d.lists.find((l) => l.slug === initialSlug);
    return (bySlug || d.lists.find((l) => l.id === d.currentId) || d.lists[0])?.id || '';
  });
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [showAuth, setShowAuth] = useState(false);
  const [pw, setPw] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  // Screen-only appearance. The real source of truth is <html data-theme>, which the
  // inline script in layout.tsx sets before first paint; this mirrors it for the button.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [colorOpenIdx, setColorOpenIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const moveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const upRef = useRef<(() => void) | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const printPageRef = useRef<HTMLDivElement | null>(null);
  const saveRef = useRef<() => void>(() => {});

  const current = (): Setlist | undefined =>
    doc.lists.find((l) => l.id === viewId) || doc.lists.find((l) => l.id === doc.currentId);

  // Keep the address bar pointing at the setlist on screen. Only rewrites when we're
  // already on a /<slug> URL, so visiting "/" stays "/" — but a rename still refreshes
  // the slug in the bar rather than leaving a stale link.
  const syncUrl = (slug: string | undefined, force = false) => {
    if (typeof window === 'undefined' || !slug) return;
    const onSlugUrl = window.location.pathname !== '/';
    if (!force && !onSlugUrl) return;
    const next = '/' + slug;
    if (window.location.pathname !== next) window.history.replaceState(null, '', next);
  };

  // ---- persistence / auth ----
  const update = (fn: (l: Setlist) => void) => {
    setDoc((prev) => {
      const lists = prev.lists.map((l) => {
        if (l.id !== viewId) return l;
        const nl: Setlist = { ...l, songs: l.songs.map((s) => ({ ...s })) };
        fn(nl);
        return nl;
      });
      // Re-derive slugs so renaming a setlist immediately updates its URL.
      return normalizeDoc({ ...prev, lists });
    });
    setDirty(true);
  };

  async function doSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveErr('');
    try {
      const res = await fetch('/api/setlist', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (res.status === 401) {
        setAuthed(false);
        setShowAuth(true);
        setSaveErr('Session expired — enter the password to save.');
        return;
      }
      if (!res.ok) throw new Error('save failed');
      setDirty(false);
    } catch {
      setSaveErr('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = doSave;

  async function doRevert() {
    if (!dirty) return;
    if (!window.confirm('Discard unsaved changes and revert to the last saved version?')) return;
    try {
      const res = await fetch('/api/setlist');
      const data = (await res.json()) as Doc;
      if (data && Array.isArray(data.lists) && data.lists.length) {
        // currentId comes back from the server (it's the published pointer); keep looking
        // at the same setlist if it still exists.
        setDoc(normalizeDoc(data));
        setViewId((v) => (data.lists.some((l) => l.id === v) ? v : data.currentId || data.lists[0].id));
        setDirty(false);
        setColorOpenIdx(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function submitAuth() {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthErr('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        setAuthed(true);
        setEditing(true);
        setShowAuth(false);
        setPw('');
      } else {
        setAuthErr('Wrong password.');
      }
    } catch {
      setAuthErr('Could not reach the server.');
    } finally {
      setAuthBusy(false);
    }
  }

  // Server-rendered PDF: always reflects what's on screen (posts the current setlist),
  // and downloads a clean single-page A4 with no browser header/footer.
  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setlist: cur }),
      });
      if (!res.ok) throw new Error('pdf failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename(cur?.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
    } catch {
      window.alert('Could not generate the PDF. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  }

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (next === 'dark') document.documentElement.dataset.theme = 'dark';
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
      return next;
    });
  }

  function onEditClick() {
    if (authed) setEditing(true);
    else {
      setPw('');
      setAuthErr('');
      setShowAuth(true);
    }
  }

  function exitEdit() {
    if (dirty && !window.confirm('You have unsaved changes. Leave the editor anyway?')) return;
    setEditing(false);
    setColorOpenIdx(null);
  }

  // ---- effects ----
  // Pick up whatever the pre-paint script decided, after hydration (reading it during
  // render would mismatch the server HTML).
  useEffect(() => {
    if (document.documentElement.dataset.theme === 'dark') setTheme('dark');
  }, []);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => { if (d?.authed) setAuthed(true); })
      .catch(() => {});
  }, []);

  // Measure the sheet and stash two factors on the wrapper:
  //  --print-scale : shrinks the 920px sheet to fit ONE A4 page (used by @media print).
  //  zoom          : fits the sheet to the screen width on mobile.
  // Computed eagerly (not on `beforeprint`, which iOS Safari never fires) so PDF export
  // works on phones too.
  useEffect(() => {
    const sheet = sheetRef.current;
    const wrap = printPageRef.current;
    if (!sheet || !wrap) return;
    const measure = () => {
      const w = 920; // sheet's fixed layout width
      const h = sheet.offsetHeight || sheet.scrollHeight || 1;
      const pageW = 794, pageH = 1122, margin = 28;
      const scale = Math.min((pageW - 2 * margin) / w, (pageH - 2 * margin) / h);
      wrap.style.setProperty('--print-scale', String(scale));
      const avail = (window.innerWidth || w) - 20;
      wrap.style.zoom = String(Math.min(1, avail / w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    window.addEventListener('resize', measure);
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [doc, editing]);

  useEffect(() => {
    const bu = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', bu);
    return () => window.removeEventListener('beforeunload', bu);
  }, [dirty]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  useEffect(() => {
    return () => {
      if (moveRef.current) window.removeEventListener('pointermove', moveRef.current);
      if (upRef.current) window.removeEventListener('pointerup', upRef.current);
    };
  }, []);

  // ---- color picker ----
  const toggleColor = (idx: number) =>
    setColorOpenIdx((v) => (v === idx ? null : idx));
  const pickColor = (idx: number, color: ColorName) => {
    update((l) => { l.songs[idx].color = color; });
    setColorOpenIdx(null);
  };

  const toggleHidden = (idx: number) =>
    update((l) => { l.songs[idx].hidden = !l.songs[idx].hidden; });
  const dupRow = (idx: number) =>
    update((l) => { l.songs.splice(idx + 1, 0, { ...l.songs[idx] }); });

  // ---- drag reorder ----
  function beginDrag(idx: number, e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { from: idx, to: idx };
    setDragging(idx);
    setDragOver(idx);
    setColorOpenIdx(null);
    const move = (ev: PointerEvent) => onDragMove(ev);
    const up = () => endDrag();
    moveRef.current = move;
    upRef.current = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onDragMove(ev: PointerEvent) {
    if (!dragRef.current) return;
    const rows = Array.from(document.querySelectorAll('.sheet .song-grid')) as HTMLElement[];
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (ev.clientY < (r.top + r.bottom) / 2) { to = i; break; }
    }
    if (to !== dragRef.current.to) {
      dragRef.current.to = to;
      setDragOver(to);
    }
  }
  function endDrag() {
    if (moveRef.current) window.removeEventListener('pointermove', moveRef.current);
    if (upRef.current) window.removeEventListener('pointerup', upRef.current);
    moveRef.current = null;
    upRef.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setDragOver(null);
    if (d && d.from !== d.to) {
      update((l) => {
        const m = l.songs.splice(d.from, 1)[0];
        l.songs.splice(d.to, 0, m);
      });
    }
  }

  // ---- setlist management ----
  // Switching only changes what's on screen; it never republishes. Use "Make current"
  // for that. Switching does move the URL to that setlist's slug so the link is shareable.
  const onSwitch = (id: string) => {
    setViewId(id);
    syncUrl(doc.lists.find((l) => l.id === id)?.slug, true);
    setColorOpenIdx(null);
  };
  const addList = (l: Setlist) => {
    setDoc((p) => normalizeDoc({ ...p, lists: [...p.lists, l] }));
    setViewId(l.id);
    setDirty(true);
    setColorOpenIdx(null);
  };
  const onNew = () => addList({
    id: newId(),
    name: 'new setlist',
    slug: '',
    date: '',
    venue: '',
    songs: [{ name: 'first track', color: 'white', bpm: '124', duration: '04:00' }],
  });
  const onDup = () => {
    const src = current();
    if (!src) return;
    addList({
      ...(JSON.parse(JSON.stringify(src)) as Setlist),
      id: newId(),
      name: (src.name || 'setlist') + ' (copy)',
      slug: '',
    });
  };
  const onDel = () => {
    if (doc.lists.length <= 1) return;
    const gone = current();
    if (gone && !window.confirm(`Delete "${gone.name || 'untitled'}"? This can't be undone.`)) return;
    setDoc((p) => {
      // normalizeDoc re-points currentId if we just deleted the published setlist.
      const lists = p.lists.filter((l) => l.id !== viewId);
      const next = normalizeDoc({ ...p, lists });
      setViewId(next.currentId);
      return next;
    });
    setDirty(true);
    setColorOpenIdx(null);
  };

  // Publish: make the setlist on screen the one "/" serves.
  const onMakeCurrent = () => {
    if (!cur || cur.id === doc.currentId) return;
    setDoc((p) => ({ ...p, currentId: viewId }));
    setDirty(true);
  };

  const copyLink = async () => {
    if (!cur) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${cur.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is in the address bar anyway */
    }
  };

  // ---- derived ----
  const cur = current();
  const songs = cur ? cur.songs : [];
  // Hidden tracks keep their slot in the editor but are skipped by the running clock,
  // the track numbering, the count, and the energy curve.
  let run = 0;
  let vis = 0;
  const rows = songs.map((s, i) => {
    const hidden = !!s.hidden;
    if (hidden) return { song: s, idx: i, hidden, num: '–', cum: '' };
    vis += 1;
    run += toSec(s.duration);
    return { song: s, idx: i, hidden, num: String(vis).padStart(2, '0'), cum: fmt(run) };
  });
  const totalTime = fmt(run);
  const count = vis;
  const isCurrent = !!cur && cur.id === doc.currentId;
  const v = visibleFields(cur);
  const toggleField = (f: SheetField) =>
    update((l) => { l.hide = { ...l.hide, [f]: !l.hide?.[f] }; });

  // Renaming changes the derived slug — keep a /<slug> address bar in step.
  useEffect(() => { syncUrl(cur?.slug); }, [cur?.slug]);
  const curvePath = buildCurve(songs.filter((s) => !s.hidden));

  const saveBase: CSSProperties = {
    padding: '7px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.02em',
  };
  const saveStyle: CSSProperties = dirty
    ? { ...saveBase, background: '#ff7a00', color: '#111', border: '1px solid #ff7a00', cursor: 'pointer' }
    : { ...saveBase, background: '#111', color: '#7a7a7a', border: '1px solid #555', cursor: 'default' };
  const revertStyle: CSSProperties = dirty
    ? { ...saveBase, background: '#111', color: '#fff', border: '1px solid #888', cursor: 'pointer' }
    : { ...saveBase, background: '#111', color: '#4a4a4a', border: '1px solid #333', cursor: 'default' };

  // ---- render helpers ----
  const textField = (
    value: string,
    onChange: (v: string) => void,
    style: CSSProperties,
    extra?: Record<string, unknown>,
  ) =>
    editing ? (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={style}
        {...extra}
      />
    ) : (
      <span
        className={extra?.className as string | undefined}
        style={{ ...style, display: 'block', whiteSpace: 'pre-wrap' }}
      >
        {value}
      </span>
    );

  return (
    <>
      {/* backdrop that closes the color dropdown */}
      {editing && colorOpenIdx != null && (
        <div
          className="no-print"
          onClick={() => setColorOpenIdx(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 25 }}
        />
      )}

      {/* ===== TOP BAR ===== */}
      <div
        className={'no-print toolbar' + (editing ? '' : ' toolbar-view')}
        style={{
          position: 'sticky', top: 0, zIndex: 20, background: '#111', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px',
          flexWrap: 'wrap', borderBottom: '2px solid #000',
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: 15, flex: '0 0 auto' }}>
          {siteConfig.name}
        </span>

        {!editing && cur && (
          <>
            <div style={{ width: 1, height: 22, background: '#444', flex: '0 0 auto' }} />
            <span
              style={{
                flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#9a9',
              }}
            >
              {cur.name}
            </span>
          </>
        )}

        {editing ? (
          <>
            <div style={{ width: 1, height: 22, background: '#444' }} />
            <select
              value={viewId}
              onChange={(e) => onSwitch(e.target.value)}
              className="tb-select"
            >
              {doc.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.id === doc.currentId ? '★ ' : '') + (l.name || 'untitled')}
                </option>
              ))}
            </select>
            {isCurrent ? (
              <span className="tb-current" title="this is the setlist served at /">★ Current</span>
            ) : (
              <button className="tb-btn" onClick={onMakeCurrent} title="serve this setlist at /">
                Make current
              </button>
            )}
            <button className="tb-btn" onClick={onNew}>+ New</button>
            <button className="tb-btn" onClick={onDup}>Duplicate</button>
            <button className="tb-btn danger" onClick={onDel}>Delete</button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#9a9' }}>{count} songs · {totalTime}</span>
            <button className="tb-btn" onClick={exitEdit} title="back to public view">◀ View</button>
            <button style={revertStyle} onClick={doRevert} title="discard unsaved changes">Revert</button>
            <button style={saveStyle} onClick={doSave}>{dirty ? '● Save' : 'Saved'}</button>
            <button className="export-btn" onClick={exportPdf} disabled={pdfBusy}>{pdfBusy ? 'PDF…' : 'Export PDF ↓'}</button>
          </>
        ) : (
          <>
            <span className="toolbar-status" style={{ fontSize: 12, color: '#9a9', flex: '0 0 auto' }}>{count} songs · {totalTime}</span>
            <button className="edit-btn" onClick={onEditClick}>Edit</button>
            <button className="export-btn" onClick={exportPdf} disabled={pdfBusy}>{pdfBusy ? 'PDF…' : 'Export PDF ↓'}</button>
          </>
        )}

        {/* Screen-only appearance toggle; the sheet always prints light. */}
        <button
          className="theme-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'switch to light mode' : 'switch to dark mode'}
          aria-label={theme === 'dark' ? 'switch to light mode' : 'switch to dark mode'}
        >
          {theme === 'dark' ? SunIcon : MoonIcon}
        </button>
      </div>

      {/* setlist-name row (editor only) */}
      {editing && (
        <div
          className="no-print"
          style={{
            maxWidth: 920, margin: '16px auto 0', padding: '0 20px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>SETLIST NAME</span>
          <input
            className="sl-name"
            value={cur ? cur.name : ''}
            onChange={(e) => update((l) => { l.name = e.target.value; })}
            placeholder="untitled setlist"
            style={{
              flex: 1, background: '#fff', border: '1px solid #ccc', padding: '6px 10px',
              fontSize: 13, fontWeight: 700, color: '#111',
            }}
          />
          {cur && (
            <button
              className="sl-link"
              onClick={copyLink}
              title="copy this setlist's link"
            >
              {copied ? '✓ copied' : `/${cur.slug}`}
            </button>
          )}
        </div>
      )}

      {/* show/hide sheet fields for this setlist (editor only) */}
      {editing && cur && TOGGLES.length > 0 && (
        <div
          className="no-print"
          style={{
            maxWidth: 920, margin: '10px auto 0', padding: '0 20px',
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#888', fontWeight: 700, marginRight: 4 }}>SHOW</span>
          {TOGGLES.map((f) => (
            <button
              key={f}
              className={'sl-toggle' + (v[f] ? ' on' : '')}
              onClick={() => toggleField(f)}
              title={(v[f] ? 'hide ' : 'show ') + f + ' on this setlist'}
            >
              {v[f] ? EyeIcon : EyeOffIcon} {f}
            </button>
          ))}
        </div>
      )}

      {/* ===== SHEET ===== */}
      <div className="sheet-scroll" style={{ display: 'flex', justifyContent: 'center', padding: '20px 10px 80px' }}>
        <div ref={printPageRef} className="print-page">
        <div
          ref={sheetRef}
          className="sheet"
          style={{
            width: 920, flex: '0 0 auto', background: '#fff', padding: '56px 64px 48px',
            boxShadow: '0 8px 40px rgba(0,0,0,.14)', border: '1px solid #ddd',
          }}
        >
          {/* Foreground <img> (not a masked background) so it always prints. */}
          {siteConfig.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={siteConfig.logo.src}
              alt={siteConfig.logo.alt}
              className={siteConfig.logo.invertInDark ? 'invert-dark' : undefined}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          ) : (
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', color: '#000', textTransform: 'lowercase' }}>
              {siteConfig.name}
            </div>
          )}

          <div style={{ height: 34 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.filter((r) => editing || !r.hidden).map(({ song: s, idx, hidden, num, cum }) => {
              const isOpen = editing && colorOpenIdx === idx;
              const wrapStyle: CSSProperties = {
                position: 'relative',
                opacity: hidden ? 0.4 : 1,
                zIndex: isOpen ? 40 : dragging === idx ? 50 : 1,
                background: dragging === idx ? '#eef4ff' : 'transparent',
                boxShadow:
                  dragging != null && dragging !== idx && dragOver === idx
                    ? 'inset 0 3px 0 #ff7a00'
                    : 'none',
              };
              return (
                <div key={idx} className="song-row" style={wrapStyle}>
                  {editing && (
                    <div
                      className="row-ctrl no-print"
                      style={{
                        position: 'absolute', top: 0, bottom: 0, right: 'calc(100% + 20px)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span
                        onPointerDown={(e) => beginDrag(idx, e)}
                        title="drag to reorder"
                        style={{
                          cursor: 'grab', fontSize: 24, lineHeight: 1, color: '#222',
                          userSelect: 'none', touchAction: 'none',
                        }}
                      >
                        ⠿
                      </span>
                      <button
                        className="row-ctrl-btn"
                        title={hidden ? 'show track (add back to the set)' : 'hide track (skip in the set)'}
                        onClick={() => toggleHidden(idx)}
                      >
                        {hidden ? EyeOffIcon : EyeIcon}
                      </button>
                      <button className="row-ctrl-btn" title="duplicate" onClick={() => dupRow(idx)}>
                        {CopyIcon}
                      </button>
                      <button
                        className="row-del"
                        title="delete"
                        onClick={() => update((l) => { l.songs.splice(idx, 1); })}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <div
                    className="song-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: sheetCols(v),
                      gap: 16, alignItems: 'center', fontWeight: 700, fontSize: 23,
                    }}
                  >
                    {v.numbers && (
                      <span className="num" style={{ color: '#000', letterSpacing: '-0.02em' }}>{num}</span>
                    )}

                    {textField(
                      s.name,
                      (v) => update((l) => { l.songs[idx].name = v; }),
                      { ...inputBase, textTransform: 'lowercase' },
                    )}

                    {v.colors && (
                    <div style={{ position: 'relative' }}>
                      {editing ? (
                        <>
                          <button
                            onClick={() => toggleColor(idx)}
                            title="change color"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                              background: 'transparent', border: 'none', padding: '2px 0', margin: 0, cursor: 'pointer',
                            }}
                          >
                            <span className="swatch" style={swatchStyle(s.color)} />
                            <span style={{ fontSize: 23, fontWeight: 700, color: '#000', textTransform: 'lowercase' }}>
                              {s.color}
                            </span>
                          </button>
                          {isOpen && (
                            <div
                              className="color-menu no-print"
                              style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30,
                                background: '#fff', border: '2px solid #000', display: 'flex',
                                flexDirection: 'column', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,.22)',
                              }}
                            >
                              {COLOR_LIST.map((name) => (
                                <button key={name} className="color-opt" onClick={() => pickColor(idx, name)}>
                                  <span className="swatch" style={swatchStyle(name)} />
                                  <span style={{ fontSize: 16, fontWeight: 700, color: '#000', textTransform: 'lowercase' }}>
                                    {name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="swatch" style={swatchStyle(s.color)} />
                          <span style={{ fontSize: 23, fontWeight: 700, color: '#000', textTransform: 'lowercase' }}>
                            {s.color}
                          </span>
                        </div>
                      )}
                    </div>
                    )}

                    {numericCount(v) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {v.bpm && (editing ? (
                        <input
                          className="num"
                          value={s.bpm}
                          spellCheck={false}
                          inputMode="numeric"
                          onChange={(e) => update((l) => { l.songs[idx].bpm = e.target.value; })}
                          style={{ ...inputBase, width: '4ch', textAlign: 'left' }}
                        />
                      ) : (
                        <span className="num" style={{ fontSize: 23, fontWeight: 700, color: '#000' }}>{s.bpm}</span>
                      ))}

                      {v.duration && (editing ? (
                        <input
                          className="num"
                          value={s.duration}
                          spellCheck={false}
                          onChange={(e) => update((l) => { l.songs[idx].duration = e.target.value; })}
                          style={{ ...inputBase, width: '6ch', textAlign: 'left' }}
                        />
                      ) : (
                        <span className="num" style={{ fontSize: 23, fontWeight: 700, color: '#000' }}>{s.duration}</span>
                      ))}

                      {v.total && (
                        <span className="num" style={{ fontSize: 23, fontWeight: 700, color: '#000' }}>{cum}</span>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {editing && (
            <button className="add-btn no-print" onClick={() => update((l) => l.songs.push({ name: 'new track', color: 'white', bpm: '128', duration: '04:00' }))}>
              + ADD SONG
            </button>
          )}

          {v.curve && (
            <div style={{ marginTop: 30 }}>
              <svg
                viewBox="0 0 1000 120"
                preserveAspectRatio="none"
                style={{ display: 'block', width: '100%', height: 110, overflow: 'visible' }}
              >
                <path
                  d={curvePath}
                  fill="none"
                  stroke="#000"
                  strokeWidth={CURVE_THICKNESS}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}

          {v.footer && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, marginTop: 26 }}>
            {textField(
              cur ? cur.date : '',
              (v) => update((l) => { l.date = v; }),
              { ...inputBase, padding: '2px 2px', textTransform: 'lowercase', flex: '0 0 auto', width: '44%' },
            )}
            {textField(
              cur ? cur.venue : '',
              (v) => update((l) => { l.venue = v; }),
              { ...inputBase, padding: '2px 2px', textTransform: 'lowercase', textAlign: 'right', flex: 1 },
            )}
          </div>
          )}
        </div>
        </div>
      </div>

      {/* save error toast (editor) */}
      {editing && saveErr && (
        <div
          className="no-print"
          style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: '#c00', color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 700, zIndex: 60,
          }}
        >
          {saveErr}
        </div>
      )}

      {/* ===== PASSWORD MODAL ===== */}
      {showAuth && (
        <div
          className="no-print"
          style={{
            position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowAuth(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', border: '2px solid #000', padding: 24, width: 320, boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 4 }}>
              Enter password to edit
            </div>
            <div style={{ fontSize: 12, color: '#777', marginBottom: 14 }}>
              This unlocks editing for everyone using this browser.
            </div>
            <input
              className="modal-input"
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAuth(); }}
              placeholder="password"
            />
            {authErr && (
              <div style={{ color: '#c00', fontSize: 12, fontWeight: 700, marginTop: 8 }}>{authErr}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAuth(false)}
                style={{ background: '#fff', border: '1px solid #ccc', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
              <button className="modal-btn" onClick={submitAuth} disabled={authBusy}>
                {authBusy ? '…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
