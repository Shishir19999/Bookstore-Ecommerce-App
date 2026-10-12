import { useEffect, useId, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBook, faBookOpen, faHeadphones, faTabletScreenButton } from '@fortawesome/free-solid-svg-icons'
import { FORMAT_LABEL, STATUS_LABEL } from '../lib/format'

const ICONS = { paperback: faBook, hardcover: faBookOpen, ebook: faTabletScreenButton, audiobook: faHeadphones }
export const FormatIcon = ({ type }) => <FontAwesomeIcon icon={ICONS[type] || faBook} aria-hidden="true" />

// Small row of the editions a book comes in.
export function FormatChips({ book }) {
  return (
    <span className="fmt-chips" aria-label={`Available as ${book.formats.map((f) => FORMAT_LABEL[f.type]).join(', ')}`}>
      {book.formats.map((f) => (
        <span key={f.type} className="fmt-chip" title={FORMAT_LABEL[f.type]}>
          <FormatIcon type={f.type} />
        </span>
      ))}
    </span>
  )
}

// Labelled form control with inline error/hint wiring.
export function Field({ id, label, error, hint, as: Tag = 'input', children, className = '', ...props }) {
  const auto = useId()
  const fid = id || auto
  return (
    <div className={`field ${className}`}>
      <label htmlFor={fid}>{label}</label>
      <Tag id={fid} className="input" aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} {...props}>
        {children}
      </Tag>
      {error ? (
        <span className="err" id={`${fid}-err`}>{error}</span>
      ) : hint ? (
        <span className="hint" id={`${fid}-hint`}>{hint}</span>
      ) : null}
    </div>
  )
}

// Circular progress ring (SVG). `children` is shown in the centre.
export function Ring({ value, max = 100, size = 132, stroke = 12, label, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring-bar" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}

// Accessible tabs (arrow keys, Home/End). Panels are rendered by the caller.
export function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef({})
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = tabs.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(tabs[n].id)
    refs.current[tabs[n].id]?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} ref={(el) => (refs.current[t.id] = el)} type="button" role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
export const Panel = ({ id, children }) => (
  <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
    {children}
  </div>
)

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Pagination">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small">Page {page} of {pages}</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  )
}

export function StatusPill({ status }) {
  const cls = status === 'delivered' || status === 'refunded' || status === 'approved' ? 'pill-success' : status === 'cancelled' || status === 'rejected' ? 'pill-danger' : status === 'preorder' || status === 'requested' ? 'pill-accent' : 'pill-info'
  return <span className={`pill ${cls}`}>{STATUS_LABEL[status] || status}</span>
}

// Generic modal built on <dialog>: focus is trapped by the browser, Escape and the backdrop close it.
export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null)
  const tid = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={tid} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 id={tid} style={{ margin: 0, fontSize: '1.35rem' }}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>&times;</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

// Collapses long lists of numbers into a tiny accessible bar chart (value per label).
export function BarList({ rows, valueKey = 'revenue', labelKey = 'name', format = (v) => v, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r[valueKey]))
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r[labelKey]}>
          <span className="bl-label">{r[labelKey]}</span>
          <span className="bl-track" aria-hidden="true"><i style={{ width: `${(r[valueKey] / top) * 100}%` }} /></span>
          <span className="bl-val">{format(r[valueKey])}</span>
        </li>
      ))}
    </ul>
  )
}
