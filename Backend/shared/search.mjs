// Typo-tolerant search, autocomplete and "because you read" recommendations. Pure functions over plain book objects.
import { toIsbn13, cleanIsbn } from './rules.mjs'

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Optimal string alignment distance (Levenshtein plus adjacent transpositions), with an early exit above `max`.
export function distance(a, b, max = 3) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array(b.length + 1)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

const allowedTypos = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2)

// Score of one query token against the tokens of a field: 0 = no match.
function tokenScore(qt, fieldTokens) {
  let best = 0
  for (const ft of fieldTokens) {
    if (ft === qt) best = Math.max(best, 10)
    else if (ft.startsWith(qt)) best = Math.max(best, 8)
    else if (qt.length >= 3 && ft.includes(qt)) best = Math.max(best, 5)
    else {
      const maxTypos = allowedTypos(qt.length)
      if (maxTypos) {
        const d = distance(qt, ft.slice(0, Math.max(qt.length, Math.min(ft.length, qt.length + 1))), maxTypos)
        const d2 = d > maxTypos ? distance(qt, ft, maxTypos) : d
        const dd = Math.min(d, d2)
        if (dd <= maxTypos) best = Math.max(best, 6 - dd * 1.5)
      }
    }
  }
  return best
}

function fieldsOf(book) {
  return [
    { tokens: norm(book.title).split(' '), weight: 3, text: norm(book.title) },
    { tokens: norm(book.author).split(' '), weight: 2, text: norm(book.author) },
    { tokens: norm(book.series?.name).split(' '), weight: 1.2, text: norm(book.series?.name) },
    { tokens: norm((book.tags || []).join(' ')).split(' '), weight: 0.8, text: '' },
  ]
}

// Returns a relevance score (0 = no match). Every query token must match some field.
export function scoreBook(book, query) {
  const q = norm(query)
  if (!q) return 1
  const digits = cleanIsbn(query)
  if (digits.length >= 10) {
    const want = toIsbn13(digits) || digits
    const isbns = [book.isbn, ...(book.formats || []).map((f) => f.isbn)].filter(Boolean).map(cleanIsbn)
    if (isbns.includes(want)) return 1000
  }
  const qts = q.split(' ')
  const fields = fieldsOf(book)
  let total = 0
  for (const qt of qts) {
    let best = 0
    for (const f of fields) best = Math.max(best, tokenScore(qt, f.tokens) * f.weight)
    if (!best) return 0
    total += best
  }
  const title = fields[0].text
  if (title === q) total += 40
  else if (title.startsWith(q)) total += 20
  else if (title.includes(q)) total += 10
  if (fields[1].text.includes(q)) total += 8
  return total
}

export function searchBooks(books, query) {
  const out = []
  for (const b of books) {
    const s = scoreBook(b, query)
    if (s > 0) out.push({ book: b, score: s })
  }
  return out.sort((a, b) => b.score - a.score || (b.book.sold || 0) - (a.book.sold || 0) || a.book.title.localeCompare(b.book.title))
}

// Nearest known words for "did you mean".
export function didYouMean(books, query) {
  const q = norm(query)
  if (!q || q.length < 3) return null
  const vocab = new Map()
  for (const b of books) for (const w of norm(`${b.title} ${b.author} ${b.series?.name || ''}`).split(' ')) if (w.length > 3) vocab.set(w, (vocab.get(w) || 0) + 1)
  const fixed = q.split(' ').map((t) => {
    if (vocab.has(t) || t.length <= 3) return t
    let best = t
    let bd = allowedTypos(t.length) + 1
    for (const w of vocab.keys()) {
      const d = distance(t, w, bd)
      if (d < bd) {
        bd = d
        best = w
      }
    }
    return best
  })
  const out = fixed.join(' ')
  return out === q ? null : out
}

export function suggest(books, query, limit = 6) {
  const q = norm(query)
  if (!q) return { books: [], authors: [], series: [], didYouMean: null }
  const ranked = searchBooks(books, query)
  const authors = new Map()
  const series = new Map()
  for (const { book } of searchBooks(books, query).slice(0, 40)) {
    if (norm(book.author).split(' ').some((w) => w.startsWith(q.split(' ')[0]) || distance(w, q.split(' ')[0], 1) <= 1) || norm(book.author).includes(q)) authors.set(book.author, (authors.get(book.author) || 0) + 1)
    if (book.series && norm(book.series.name).includes(q.split(' ')[0])) series.set(book.series.name, book.series.slug || '')
  }
  return {
    books: ranked.slice(0, limit).map((r) => r.book),
    authors: [...authors.keys()].slice(0, 3),
    series: [...series].slice(0, 2).map(([name, slug]) => ({ name, slug })),
    didYouMean: ranked.length < 3 ? didYouMean(books, query) : null,
  }
}

// ---------- recommendations ----------
// signals: { seeds: [book] (most recent first), exclude: Set<id>, together: Map<bookId, Map<otherId, n>> }
export function recommendFor(books, seed, signals, limit = 6) {
  const scored = []
  const together = signals.together?.get(String(seed._id))
  for (const b of books) {
    if (String(b._id) === String(seed._id) || signals.exclude.has(String(b._id))) continue
    let s = 0
    if (seed.series && b.series && seed.series.name === b.series.name) s += 6 + (b.series.number > seed.series.number ? 2 : 0)
    if (b.author === seed.author) s += 4
    if (b.genre && b.genre === seed.genre) s += 2
    if (b.language && b.language === seed.language) s += 1
    const n = together?.get(String(b._id)) || 0
    s += Math.min(4, n * 0.8)
    if (s < 2) continue
    s += (b.rating || 0) / 5 + Math.min(1, (b.sold || 0) / 200)
    scored.push({ book: b, score: s })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.book)
}

export function recommendations(books, signals, { sections = 3, perSection = 6 } = {}) {
  const used = new Set()
  const out = []
  for (const seed of signals.seeds) {
    if (out.length >= sections) break
    const picks = recommendFor(books, seed, { ...signals, exclude: new Set([...signals.exclude, ...used]) }, perSection)
    if (picks.length < 2) continue
    picks.forEach((p) => used.add(String(p._id)))
    out.push({ because: { _id: seed._id, title: seed.title, author: seed.author }, kind: signals.kindOf?.(seed) || 'read', books: picks })
  }
  return out
}
