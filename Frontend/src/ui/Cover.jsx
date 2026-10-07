import { useId, useState } from 'react'
import { imageSrc } from '../api'
import { hash } from '../lib/format'

const HUES = {
  Fantasy: 268,
  'Science Fiction': 205,
  Mystery: 162,
  Romance: 342,
  'Historical Fiction': 28,
  'Science & Nature': 140,
  Technology: 245,
  Poetry: 46,
}

// Wraps a title into at most 5 short lines for the drawn cover.
function wrap(title) {
  const words = title.split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 13) {
      lines.push(cur)
      cur = w
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) lines.push(cur)
  if (lines.length > 5) {
    lines.length = 5
    lines[4] = lines[4].slice(0, 11) + '...'
  }
  return lines
}

function Motif({ kind, hue }) {
  const c = `hsla(${hue}, 80%, 85%, 0.16)`
  if (kind === 0)
    return (
      <g fill={c}>
        <circle cx="160" cy="60" r="70" />
        <circle cx="30" cy="240" r="55" />
      </g>
    )
  if (kind === 1)
    return (
      <g stroke={c} strokeWidth="14">
        <path d="M-20 120 L220 -20" />
        <path d="M-20 200 L220 60" />
        <path d="M-20 280 L220 140" />
      </g>
    )
  if (kind === 2)
    return (
      <g fill="none" stroke={c} strokeWidth="6">
        <circle cx="100" cy="300" r="60" />
        <circle cx="100" cy="300" r="95" />
        <circle cx="100" cy="300" r="130" />
        <circle cx="100" cy="300" r="165" />
      </g>
    )
  return (
    <g fill={c}>
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={20 + (i % 6) * 32} cy={20 + Math.floor(i / 6) * 22} r="3.5" />
      ))}
    </g>
  )
}

// Offline-safe drawn cover: gradient + motif + title/author, deterministic per book.
export function DrawnCover({ title, author, genre, className = '' }) {
  const id = useId()
  const h = HUES[genre] ?? hash(genre || title) % 360
  const kind = hash(title) % 4
  const lines = wrap(title)
  const size = Math.max(...lines.map((l) => l.length)) > 11 ? 21 : 24
  return (
    <svg
      className={`cover cover-svg ${className}`}
      viewBox="0 0 200 300"
      role="img"
      aria-label={`Cover of ${title} by ${author}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h}, 52%, 34%)`} />
          <stop offset="1" stopColor={`hsl(${(h + 32) % 360}, 58%, 16%)`} />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill={`url(#g${id})`} />
      <Motif kind={kind} hue={h} />
      <rect x="10" y="10" width="180" height="280" rx="3" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
      <rect x="0" y="0" width="9" height="300" fill="rgba(0,0,0,0.22)" />
      <text x="100" y="42" textAnchor="middle" fontSize="9" letterSpacing="2.5" fill="rgba(255,255,255,0.78)" fontFamily="system-ui, sans-serif">
        {(genre || 'BOOK').toUpperCase().slice(0, 20)}
      </text>
      <text textAnchor="middle" fill="#fff" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize={size}>
        {lines.map((l, i) => (
          <tspan key={i} x="100" y={110 + i * (size + 6)}>
            {l}
          </tspan>
        ))}
      </text>
      <line x1="70" y1="258" x2="130" y2="258" stroke="rgba(255,255,255,0.5)" />
      <text x="100" y="277" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.92)" fontFamily="system-ui, sans-serif">
        {author.length > 26 ? author.slice(0, 25) + '...' : author}
      </text>
    </svg>
  )
}

// A book cover: an uploaded/URL image when present, otherwise the drawn cover.
export default function Cover({ book, className = '', eager = false }) {
  const [failed, setFailed] = useState(false)
  const src = imageSrc(book.image)
  if (!src || failed) return <DrawnCover title={book.title} author={book.author} genre={book.genre} className={className} />
  return (
    <img
      className={`cover cover-img ${className}`}
      src={src}
      alt={`Cover of ${book.title}`}
      width="200"
      height="300"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
