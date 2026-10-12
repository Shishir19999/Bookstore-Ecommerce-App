import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, saveFile } from '../api'
import { useAuth, useCart, useReading, useTitle, useToast } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import { Modal } from '../ui/Parts'
import { DEFAULT_READER, getGuestReader, getReaderPrefs, saveGuestReader, saveReaderPrefs } from '../lib/storage'
import { hoursMin } from '../lib/format'

const COLORS = ['yellow', 'green', 'blue', 'pink']
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const paraOf = (node) => (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('[data-para]')

// A paragraph with its highlights rendered as <mark> elements (offsets are into the paragraph text).
function Para({ text, index, hls, onMark }) {
  const parts = []
  let pos = 0
  for (const h of hls.slice().sort((a, b) => a.start - b.start)) {
    if (h.start < pos || h.end > text.length || h.end <= h.start) continue
    if (h.start > pos) parts.push(text.slice(pos, h.start))
    parts.push(
      <mark key={h.id} className={`hl hl-${h.color}`} tabIndex={0} role="button" aria-label={`Highlight${h.note ? ` with note: ${h.note}` : ''}. Press Enter to open your notes.`} onClick={() => onMark(h)} onKeyDown={(e) => e.key === 'Enter' && onMark(h)}>
        {text.slice(h.start, h.end)}
      </mark>
    )
    pos = h.end
  }
  parts.push(text.slice(pos))
  return <p data-para={index}>{parts}</p>
}

function Settings({ prefs, setPrefs }) {
  const set = (k, v) => setPrefs({ ...prefs, [k]: v })
  return (
    <div className="reader-settings card" role="group" aria-label="Reading settings">
      <div className="row between">
        <span>Text size</span>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" aria-label="Smaller text" disabled={prefs.size <= 14} onClick={() => set('size', prefs.size - 1)}>A-</button>
          <output aria-live="polite" style={{ minWidth: 28, textAlign: 'center' }}>{prefs.size}</output>
          <button type="button" className="btn btn-sm" aria-label="Larger text" disabled={prefs.size >= 32} onClick={() => set('size', prefs.size + 1)}>A+</button>
        </span>
      </div>
      <div className="row between">
        <span id="rs-font">Typeface</span>
        <span className="seg" role="group" aria-labelledby="rs-font">
          {[['serif', 'Serif'], ['sans', 'Sans']].map(([v, l]) => <button key={v} type="button" aria-pressed={prefs.font === v} onClick={() => set('font', v)}>{l}</button>)}
        </span>
      </div>
      <div className="row between">
        <span id="rs-sp">Line spacing</span>
        <span className="seg" role="group" aria-labelledby="rs-sp">
          {[[1.45, 'Tight'], [1.7, 'Normal'], [2, 'Roomy']].map(([v, l]) => <button key={v} type="button" aria-pressed={prefs.spacing === v} onClick={() => set('spacing', v)}>{l}</button>)}
        </span>
      </div>
      <div className="row between">
        <span id="rs-th">Theme</span>
        <span className="seg" role="group" aria-labelledby="rs-th">
          {[['paper', 'Paper'], ['sepia', 'Sepia'], ['night', 'Night']].map(([v, l]) => <button key={v} type="button" aria-pressed={prefs.theme === v} onClick={() => set('theme', v)}>{l}</button>)}
        </span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrefs({ ...DEFAULT_READER })}>Reset to defaults</button>
    </div>
  )
}

export default function Reader() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const format = params.get('format') === 'audiobook' ? 'audiobook' : 'ebook'
  const { user } = useAuth()
  const toast = useToast()
  const { addToCart } = useCart()
  const { setStatus, statusOf } = useReading()
  const [text, setText] = useState(null)
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [prefs, setPrefsState] = useState(getReaderPrefs)
  const [chSel, setChSel] = useState(null)
  const [panel, setPanel] = useState(null) // null | 'notes' | 'marks' | 'toc'
  const [showSettings, setShowSettings] = useState(false)
  const [sel, setSel] = useState(null)
  const [focusHl, setFocusHl] = useState('')
  const [pct, setPct] = useState(0)
  const [ended, setEnded] = useState(false)
  const [confirmExport, setConfirmExport] = useState(false)
  const contentRef = useRef(null)
  const saveTimer = useRef(null)
  const pending = useRef(null)
  const visibleSec = useRef(0)
  const restored = useRef(false)
  // the saved chapter is the starting point; once the reader navigates, their choice wins
  const ch = text && state ? (chSel ?? Math.min(Math.max(0, state.progress?.chapter ?? 0), text.chapters.length - 1)) : 0
  const setCh = setChSel
  useTitle(text ? `Reading ${text.book.title}` : 'Reader')

  // load text + saved state
  useEffect(() => {
    let cancelled = false
    api(`/api/books/${id}/text?format=${format}`).then(
      (t) => !cancelled && setText(t),
      (e) => !cancelled && setError(e.message)
    )
    const load = user ? api(`/api/me/reader/${id}`) : Promise.resolve(getGuestReader(id))
    load.then((s) => !cancelled && setState({ progress: s.progress || null, bookmarks: s.bookmarks || [], highlights: s.highlights || [] })).catch(() => !cancelled && setState({ progress: null, bookmarks: [], highlights: [] }))
    return () => {
      cancelled = true
    }
  }, [id, format, user])

  const persist = useCallback(
    (patch) => {
      pending.current = { ...(pending.current || {}), ...patch }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const body = pending.current
        pending.current = null
        if (!body) return
        if (user) api(`/api/me/reader/${id}`, { method: 'PUT', body }).catch(() => {})
        else saveGuestReader(id, { ...getGuestReader(id), ...body })
      }, 700)
    },
    [id, user]
  )
  useEffect(() => () => clearTimeout(saveTimer.current), [])
  const setPrefs = (p) => {
    setPrefsState(p)
    saveReaderPrefs(p)
  }

  // restore position once
  useEffect(() => {
    if (!text || !state || restored.current) return
    restored.current = true
    const p = state.progress
    if (p && p.chapter < text.chapters.length) {
      setTimeout(() => {
        const el = contentRef.current?.querySelector(`[data-para="${p.para}"]`)
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90 })
      }, 60)
    }
  }, [text, state])

  // track the paragraph at the top of the screen, overall progress and the end of the text
  useEffect(() => {
    if (!text) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const paras = [...(contentRef.current?.querySelectorAll('[data-para]') || [])]
        if (!paras.length) return
        const top = paras.find((p) => p.getBoundingClientRect().bottom > 96) || paras[paras.length - 1]
        const para = Number(top.dataset.para)
        const doc = document.documentElement
        const frac = Math.min(1, Math.max(0, window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)))
        const overall = Math.round(((ch + frac) / text.chapters.length) * 1000) / 10
        setPct(overall)
        setEnded(ch === text.chapters.length - 1 && frac > 0.96)
        persist({ progress: { chapter: ch, para, pct: Math.min(100, overall) } })
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [text, ch, persist])

  // selection inside the text -> enable highlight actions (also reachable by keyboard)
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()
      if (!s || s.isCollapsed || !s.rangeCount) return
      const r = s.getRangeAt(0)
      const a = paraOf(r.startContainer)
      const b = paraOf(r.endContainer)
      if (!a || a !== b || !contentRef.current?.contains(a)) return
      const pre = document.createRange()
      pre.selectNodeContents(a)
      pre.setEnd(r.startContainer, r.startOffset)
      const start = pre.toString().length
      const textSel = r.toString()
      if (!textSel.trim()) return
      setSel({ chapter: ch, para: Number(a.dataset.para), start, end: start + textSel.length, text: textSel.slice(0, 500) })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [ch])

  // keyboard: arrow keys change chapter (not while typing)
  useEffect(() => {
    if (!text) return
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') (setPanel(null), setShowSettings(false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ch])

  // reading time (only while the tab is visible), sent to the streak tracker
  useEffect(() => {
    if (!user) return
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') visibleSec.current += 5
      if (visibleSec.current >= 60) {
        api('/api/me/activity', { method: 'POST', body: { minutes: 1 } }).catch(() => {})
        visibleSec.current -= 60
      }
    }, 5000)
    return () => {
      clearInterval(tick)
      if (visibleSec.current >= 20) api('/api/me/activity', { method: 'POST', body: { minutes: 1 } }).catch(() => {})
    }
  }, [user])

  const chapter = text?.chapters[ch]
  const hls = useMemo(() => (state?.highlights || []).filter((h) => h.chapter === ch), [state, ch])
  const marks = state?.bookmarks || []

  function go(d) {
    if (!text) return
    const n = Math.min(text.chapters.length - 1, Math.max(0, ch + d))
    if (n !== ch) {
      setCh(n)
      window.scrollTo({ top: 0 })
    }
  }
  const update = (patch) => {
    setState((s) => ({ ...s, ...patch }))
    persist(patch)
  }
  const addHighlight = (color) => {
    if (!sel) return
    const h = { id: uid(), ...sel, note: '', color, createdAt: new Date().toISOString() }
    update({ highlights: [...(state?.highlights || []), h] })
    window.getSelection()?.removeAllRanges()
    setSel(null)
    toast.success('Highlight saved.')
    return h
  }
  const addNote = () => {
    const h = addHighlight('yellow')
    if (h) {
      setFocusHl(h.id)
      setPanel('notes')
    }
  }
  const currentPara = () => {
    const paras = [...(contentRef.current?.querySelectorAll('[data-para]') || [])]
    const top = paras.find((p) => p.getBoundingClientRect().bottom > 96)
    return Number(top?.dataset.para || 0)
  }
  const bookmarkHere = () => {
    const para = currentPara()
    const existing = marks.find((m) => m.chapter === ch && m.para === para)
    if (existing) return update({ bookmarks: marks.filter((m) => m !== existing) })
    const label = (chapter.paragraphs[para] || '').slice(0, 60).trim()
    update({ bookmarks: [...marks, { id: uid(), chapter: ch, para, label: `${chapter.title}: ${label}`.slice(0, 80), createdAt: new Date().toISOString() }] })
    toast.success('Bookmark added.')
  }
  const jump = (chapterIdx, para) => {
    setCh(chapterIdx)
    setPanel(null)
    setTimeout(() => {
      const el = contentRef.current?.querySelector(`[data-para="${para}"]`)
      window.scrollTo({ top: el ? el.getBoundingClientRect().top + window.scrollY - 90 : 0, behavior: 'smooth' })
    }, 60)
  }
  const exportNotes = () => {
    const lines = [`# Notes: ${text.book.title}`, '', ...(state.highlights || []).map((h) => `- (${text.chapters[h.chapter]?.title || 'Chapter'}) "${h.text}"${h.note ? `\n  Note: ${h.note}` : ''}`), '', ...(marks.length ? ['## Bookmarks', ...marks.map((m) => `- ${m.label}`)] : [])]
    saveFile(lines.join('\n'), `${text.book.slug || 'book'}-notes.md`, 'text/markdown')
  }

  if (error) return <div className="container page"><ErrorState title="Cannot open this book" message={error} /></div>
  if (!text || !state) return <PageSkeleton />
  const bookmarkedHere = marks.some((m) => m.chapter === ch && m.para === currentPara())
  return (
    <div className={`reader reader-${prefs.theme}`} style={{ '--rd-size': `${prefs.size}px`, '--rd-spacing': prefs.spacing }} data-font={prefs.font}>
      <div className="reader-bar" role="toolbar" aria-label="Reader controls">
        <div className="container reader-bar-in">
          <Link to={`/books/${id}`} className="btn btn-ghost btn-sm">&larr; Back</Link>
          <div className="reader-title">
            <strong>{text.book.title}</strong>
            <span className="small muted">{text.full ? 'Full text' : 'Free sample'} &middot; {Math.round(pct)}%</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === 'toc' ? null : 'toc')} aria-expanded={panel === 'toc'}>Contents</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === 'notes' ? null : 'notes')} aria-expanded={panel === 'notes'}>Notes ({(state.highlights || []).length})</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={bookmarkHere} aria-pressed={bookmarkedHere}>{bookmarkedHere ? 'Bookmarked' : 'Bookmark'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} aria-label="Reading settings">Aa</button>
        </div>
        <div className="reader-progress" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /></div>
        {showSettings && <div className="container"><Settings prefs={prefs} setPrefs={setPrefs} /></div>}
        {sel && (
          <div className="container">
            <div className="sel-bar" role="group" aria-label="Selected text actions">
              <span className="small">&ldquo;{sel.text.slice(0, 40)}{sel.text.length > 40 ? '...' : ''}&rdquo;</span>
              {COLORS.map((c) => <button key={c} type="button" className={`swatch hl-${c}`} aria-label={`Highlight in ${c}`} onClick={() => addHighlight(c)} />)}
              <button type="button" className="btn btn-sm" onClick={addNote}>Add note</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </div>

      <div className="container reader-layout">
        <article className="reader-text" ref={contentRef} aria-label={`${text.book.title}, ${chapter.title}`}>
          {!user && <p className="alert alert-info no-print">Reading as a guest: your place and highlights stay on this device. <Link to="/login" state={{ from: `/read/${id}` }}>Log in</Link> to sync them.</p>}
          <h2 className="reader-chapter">{chapter.title}</h2>
          {chapter.paragraphs.map((p, i) => (
            <Para key={`${ch}-${i}`} text={p} index={i} hls={hls.filter((h) => h.para === i)} onMark={(h) => (setFocusHl(h.id), setPanel('notes'))} />
          ))}
          <nav className="reader-nav" aria-label="Chapters">
            <button type="button" className="btn" disabled={ch === 0} onClick={() => go(-1)}>&larr; Previous chapter</button>
            <span className="small muted">Chapter {ch + 1} of {text.chapters.length}</span>
            <button type="button" className="btn" disabled={ch >= text.chapters.length - 1} onClick={() => go(1)}>Next chapter &rarr;</button>
          </nav>
          {ended && (
            <div className="card end-card" role="status">
              {text.full ? (
                <>
                  <h3>You reached the end</h3>
                  <p>{statusOf(id) === 'finished' ? 'Already on your finished shelf.' : 'Mark it as finished to add it to your reading goal.'}</p>
                  {statusOf(id) !== 'finished' && <button type="button" className="btn btn-primary" onClick={() => setStatus({ _id: id, title: text.book.title }, 'finished')}>Mark as finished</button>}
                </>
              ) : (
                <>
                  <h3>End of the free sample</h3>
                  <p>This sample shows the start of the first chapter ({text.totalChapters} chapters in the full {format === 'ebook' ? 'e-book' : 'audiobook'}).</p>
                  <div className="row">
                    <button type="button" className="btn btn-primary" onClick={() => { addToCart({ _id: id, title: text.book.title, author: text.book.author, genre: text.book.genre, image: text.book.image, formats: text.book.formats }, 1, format); toast.success('Added to your cart.') }}>Add the full {format === 'ebook' ? 'e-book' : 'audiobook'}</button>
                    <Link className="btn" to={`/books/${id}`}>Book page</Link>
                  </div>
                </>
              )}
            </div>
          )}
          <p className="small muted">Source: {text.source}. About {hoursMin(text.minutes)} of reading in this {text.full ? 'text' : 'sample'}.</p>
        </article>

        {panel && (
          <aside className="reader-panel card" aria-label={panel === 'toc' ? 'Contents' : panel === 'marks' ? 'Bookmarks' : 'Highlights and notes'}>
            <div className="row between">
              <div className="seg" role="group" aria-label="Panel">
                {[['toc', 'Contents'], ['notes', 'Notes'], ['marks', 'Bookmarks']].map(([v, l]) => <button key={v} type="button" aria-pressed={panel === v} onClick={() => setPanel(v)}>{l}</button>)}
              </div>
              <button type="button" className="icon-btn" aria-label="Close panel" onClick={() => setPanel(null)}>&times;</button>
            </div>
            {panel === 'toc' && (
              <ol className="toc">
                {text.chapters.map((c, i) => <li key={i}><button type="button" aria-current={i === ch ? 'true' : undefined} onClick={() => jump(i, 0)}>{c.title}</button></li>)}
                {!text.full && <li className="muted small">Sample: {text.totalChapters} chapters in the full text.</li>}
              </ol>
            )}
            {panel === 'marks' && (
              marks.length === 0 ? <p className="muted small">No bookmarks yet. Use the Bookmark button to save your place.</p> : (
                <ul className="notes">
                  {marks.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="linklike" onClick={() => jump(m.chapter, m.para)}>{m.label || 'Bookmark'}</button>
                      <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => update({ bookmarks: marks.filter((x) => x.id !== m.id) })}>Remove</button>
                    </li>
                  ))}
                </ul>
              )
            )}
            {panel === 'notes' && (
              <>
                <p className="small muted">Select text in the book, then pick a colour or Add note.</p>
                {(state.highlights || []).length === 0 ? <p className="muted small">No highlights yet.</p> : (
                  <ul className="notes">
                    {(state.highlights || []).slice().sort((a, b) => a.chapter - b.chapter || a.para - b.para || a.start - b.start).map((h) => (
                      <li key={h.id} className={focusHl === h.id ? 'focus' : ''}>
                        <button type="button" className={`linklike hl hl-${h.color}`} onClick={() => jump(h.chapter, h.para)}>&ldquo;{h.text.slice(0, 90)}{h.text.length > 90 ? '...' : ''}&rdquo;</button>
                        <label className="sr-only" htmlFor={`note-${h.id}`}>Note for this highlight</label>
                        <textarea id={`note-${h.id}`} className="input" rows={2} placeholder="Add a note" maxLength={500} defaultValue={h.note} autoFocus={focusHl === h.id} onBlur={(e) => e.target.value !== h.note && update({ highlights: state.highlights.map((x) => (x.id === h.id ? { ...x, note: e.target.value } : x)) })} />
                        <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => update({ highlights: state.highlights.filter((x) => x.id !== h.id) })}>Delete</button>
                      </li>
                    ))}
                  </ul>
                )}
                {(state.highlights || []).length + marks.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setConfirmExport(true)}>Export notes</button>}
              </>
            )}
          </aside>
        )}
      </div>
      <Modal open={confirmExport} onClose={() => setConfirmExport(false)} title="Export your notes">
        <p>Download your highlights, notes and bookmarks for <strong>{text.book.title}</strong> as a Markdown file.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmExport(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => (exportNotes(), setConfirmExport(false))}>Download .md</button>
        </div>
      </Modal>
    </div>
  )
}
