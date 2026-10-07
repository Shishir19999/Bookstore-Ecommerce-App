const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const money = (n) => usd.format(Number(n) || 0)

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const authorPath = (a) => `/authors/${encodeURIComponent(a)}`
export const genrePath = (g) => `/books?genre=${encodeURIComponent(g)}`

export const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled']
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
}
export const genreHue = (g) => GENRE_HUES[g] ?? hash(g || '') % 360

export const shortId = (id) => String(id).slice(-6).toUpperCase()
