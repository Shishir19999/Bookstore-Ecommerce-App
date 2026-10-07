import { useState } from 'react'

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z'

function Row({ filled }) {
  return (
    <span className={`stars-row ${filled ? 'stars-filled' : ''}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="16" height="16">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  )
}

// Read-only star rating with an optional review count.
export function Stars({ value = 0, count }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  const label = count === 0 || !value ? 'Not rated yet' : `Rated ${value.toFixed(1)} out of 5${count ? ` from ${count} review${count === 1 ? '' : 's'}` : ''}`
  return (
    <span className="stars" role="img" aria-label={label} title={label}>
      <span className="stars-track">
        <Row />
        <span className="stars-fill" style={{ width: `${pct}%` }}>
          <Row filled />
        </span>
      </span>
      {count !== undefined && <span className="stars-count">{value ? value.toFixed(1) : '-'} ({count})</span>}
    </span>
  )
}

// Accessible 1-5 picker (radio group) for the review form.
export function StarInput({ value, onChange, name = 'rating', describedBy }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="star-input" role="radiogroup" aria-label="Your rating" aria-describedby={describedBy}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d={STAR} />
          </svg>
          <span className="sr-only">{n} star{n === 1 ? '' : 's'}</span>
        </label>
      ))}
    </div>
  )
}
