import { FORMAT_LABEL } from '../shared/rules.mjs'

export { FORMAT_LABEL }
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const money = (n) => usd.format(Number(n) || 0)
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtDateTime = (d) => new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
export const timeAgo = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return fmtDate(d)
}
export const hoursMin = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`)
export const authorPath = (a) => `/authors/${encodeURIComponent(a)}`
export const genrePath = (g) => `/books?genre=${encodeURIComponent(g)}`
export const seriesPath = (s) => `/series/${s.slug || s}`
export const ORDER_STATUSES = ['preorder', 'placed', 'processing', 'shipped', 'delivered', 'cancelled']
export const STATUS_LABEL = { preorder: 'Pre-order', placed: 'Placed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' }
export const READING_STATUSES = [
  { value: 'want', label: 'Want to read' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]
export const SORT_OPTIONS = [
  { value: 'title', label: 'Title A-Z' },
  { value: 'bestselling', label: 'Bestselling' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]
export const RETURN_REASONS = [
  ['damaged', 'Arrived damaged'],
  ['wrong-item', 'Wrong item'],
  ['not-as-described', 'Not as described'],
  ['changed-mind', 'Changed my mind'],
  ['other', 'Other'],
]
// Stable hash for deterministic colours / layouts
export const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const GENRE_HUES = {
  Fantasy: 268,
  'Science Fiction': 205,
  Mystery: 162,
  Romance: 342,
  'Historical Fiction': 28,
  'Science & Nature': 140,
  Technology: 245,
  Poetry: 46,
  Classics: 18,
}
export const genreHue = (g) => GENRE_HUES[g] ?? hash(g || '') % 360
export const shortId = (id) => String(id).slice(-6).toUpperCase()
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Absolute link to a page of this app (the live preview uses hash routing).
export const appUrl = (path) => (import.meta.env.VITE_DEMO === 'true' ? `${window.location.origin}${window.location.pathname}#${path}` : `${window.location.origin}${path}`)
