// In-browser demo backend. It answers the same REST paths as the Express API (see Backend/routes) from data kept in
// localStorage, so every page works on static hosting. Nothing here ever leaves the visitor's browser.
import catalog from './catalog.json'
import { DEMO_ACCOUNTS } from './accounts.js'

const DB_KEY = 'bookstore_demo_db_v1'
const DAY = 86400000
const STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled']
const READING = ['want', 'reading', 'finished']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round2 = (n) => Math.round(n * 100) / 100
const round1 = (n) => Math.round(n * 10) / 10

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- storage ----------
function seed() {
  const now = Date.now()
  const books = catalog.books.map((b, i) => ({
    _id: `b${String(i + 1).padStart(3, '0')}`,
    ...b,
    publishedAt: b.publishedAt,
  }))
  const reviews = catalog.reviews.map((r, i) => ({
    _id: `r${i + 1}`,
    book: books[r.book]._id,
    user: null,
    name: r.name,
    rating: r.rating,
    text: r.text,
    createdAt: new Date(now - r.daysAgo * DAY).toISOString(),
  }))
  const customers = ['Amelia Hart', 'Rohan Mehta', 'Lena Fischer', 'Marco Silva', 'Yuki Tanaka', 'Grace Mwangi']
  const users = [
    ...DEMO_ACCOUNTS.map((a, i) => ({ _id: `u${i + 1}`, name: a.name, email: a.email, password: a.password, role: a.role })),
    ...customers.map((n, i) => ({
      _id: `u${DEMO_ACCOUNTS.length + i + 1}`,
      name: n,
      email: `${n.toLowerCase().replace(/ /g, '.')}@example.com`,
      password: 'Password123!',
      role: 'user',
    })),
  ]
  const r = rng(20261007)
  const buyers = users.filter((u) => u.role === 'user')
  const orders = []
  for (let i = 0; i < 64; i++) {
    const user = i < 6 ? buyers[0] : buyers[Math.floor(r() * buyers.length)]
    const age = i < 6 ? 3 + i * 9 : Math.floor(Math.pow(r(), 1.3) * 58)
    const n = 1 + Math.floor(r() * 3)
    const items = []
    for (let k = 0; k < n; k++) {
      const b = books[Math.floor(r() * books.length)]
      if (items.some((x) => x.book === b._id)) continue
      items.push({ book: b._id, title: b.title, price: b.price, qty: 1 + Math.floor(r() * 2) })
    }
    const createdAt = new Date(now - age * DAY - Math.floor(r() * 40000) * 1000).toISOString()
    const status = age > 14 ? (r() < 0.07 ? 'cancelled' : 'delivered') : age > 6 ? 'shipped' : age > 2 ? 'processing' : 'placed'
    orders.push({
      _id: `o${i + 1}`,
      user: user._id,
      items,
      total: round2(items.reduce((s, x) => s + x.price * x.qty, 0)),
      paymentStatus: 'paid (demo)',
      status,
      createdAt,
      updatedAt: createdAt,
    })
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const reading = { u2: [{ book: books[0]._id, status: 'reading', addedAt: new Date(now - 3 * DAY).toISOString() }, { book: books[13]._id, status: 'want', addedAt: new Date(now - 2 * DAY).toISOString() }] }
  const coupons = [
    { _id: 'c1', code: 'WELCOME10', description: '10% off your order', type: 'percent', value: 10, minSubtotal: 0, expiresAt: null, usageLimit: 0, used: 12, active: true },
    { _id: 'c2', code: 'READMORE5', description: '$5 off orders over $30', type: 'fixed', value: 5, minSubtotal: 30, expiresAt: null, usageLimit: 0, used: 7, active: true },
    { _id: 'c3', code: 'SUMMER20', description: 'Expired summer sale (example of an expired coupon)', type: 'percent', value: 20, minSubtotal: 0, expiresAt: new Date(now - 30 * DAY).toISOString(), usageLimit: 0, used: 41, active: true },
  ]
  return { v: 1, books, users, reviews, orders, reading, coupons, seq: 1000 }
}

let mem = null
function load() {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.v === 1 && Array.isArray(parsed.books) && Array.isArray(parsed.coupons)) return (mem = parsed)
    }
  } catch {
    /* corrupted or unavailable storage: fall through and reseed */
  }
  mem = seed()
  save()
  return mem
}
function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(mem))
  } catch {
    /* storage full or blocked: data then lives for this tab only */
  }
}
const nextId = (db, p) => `${p}${++db.seq}`

export function resetDemoData() {
  mem = null
  try {
    localStorage.removeItem(DB_KEY)
  } catch {
    /* ignore */
  }
  load()
}

// ---------- helpers ----------
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role })

function authUser(db, token) {
  if (!token || !token.startsWith('demo-')) throw new HttpError(401, 'Authentication required')
  const user = db.users.find((u) => u._id === token.slice(5))
  if (!user) throw new HttpError(401, 'User no longer exists')
  return user
}
function requireAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required')
}

const norm = (s) => String(s ?? '').trim()
const has = (hay, needle) => String(hay).toLowerCase().includes(needle.toLowerCase())
const numOrNaN = (v) => (v === undefined || v === '' ? NaN : Number(v))

const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  'price-asc': (a, b) => a.price - b.price || a.title.localeCompare(b.title),
  'price-desc': (a, b) => b.price - a.price || a.title.localeCompare(b.title),
  rating: (a, b) => b.rating - a.rating || b.numReviews - a.numReviews || a.title.localeCompare(b.title),
  newest: (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title),
  bestselling: (a, b) => b.sold - a.sold || a.title.localeCompare(b.title),
}

function refreshRating(db, bookId) {
  const rs = db.reviews.filter((r) => r.book === bookId)
  const b = db.books.find((x) => x._id === bookId)
  if (!b) return
  b.numReviews = rs.length
  b.rating = rs.length ? round1(rs.reduce((s, r) => s + r.rating, 0) / rs.length) : 0
}

function findBook(db, id) {
  const b = db.books.find((x) => x._id === id)
  if (!b) throw new HttpError(404, 'Book not found')
  return b
}

function priceCart(db, items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) throw new HttpError(400, 'items must be a non-empty array (max 50)')
  const qty = new Map()
  for (const it of items) {
    if (!it || typeof it.book !== 'string') throw new HttpError(400, 'Invalid book id in items')
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 20) throw new HttpError(400, 'qty must be an integer between 1 and 20')
    qty.set(it.book, Math.min((qty.get(it.book) || 0) + it.qty, 20))
  }
  const lines = []
  for (const [id, q] of qty) {
    const b = db.books.find((x) => x._id === id)
    if (!b) throw new HttpError(400, 'One or more books no longer exist')
    if (b.stock < q) throw new HttpError(409, b.stock > 0 ? `Only ${b.stock} cop${b.stock === 1 ? 'y' : 'ies'} of "${b.title}" left` : `"${b.title}" is out of stock`)
    lines.push({ book: b._id, title: b.title, price: b.price, qty: q })
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.price * l.qty, 0)) }
}

function evalCoupon(coupon, subtotal) {
  if (!coupon || !coupon.active) return { ok: false, discount: 0, message: 'Invalid coupon code' }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return { ok: false, discount: 0, message: 'This coupon has expired' }
  if (coupon.usageLimit && coupon.used >= coupon.usageLimit) return { ok: false, discount: 0, message: 'This coupon has been fully redeemed' }
  if (subtotal < (coupon.minSubtotal || 0)) return { ok: false, discount: 0, message: `Spend at least ${Number(coupon.minSubtotal).toFixed(2)} to use this coupon` }
  const raw = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value
  return { ok: true, discount: round2(Math.min(subtotal, raw)), message: 'Coupon applied' }
}

function resolveCoupon(db, code, subtotal) {
  if (code === undefined || code === null || code === '') return { coupon: null, discount: 0 }
  if (typeof code !== 'string' || code.length > 30) throw new HttpError(400, 'Invalid coupon code')
  const coupon = db.coupons.find((c) => c.code === code.trim().toUpperCase())
  const r = evalCoupon(coupon, subtotal)
  if (!r.ok) throw new HttpError(400, r.message)
  return { coupon, discount: r.discount, message: r.message }
}

function parseCoupon(body, partial) {
  const d = {}
  if (body.code !== undefined || !partial) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpError(400, 'code must be 3-30 letters, digits, - or _')
    d.code = code
  }
  if (body.type !== undefined || !partial) {
    if (!['percent', 'fixed'].includes(body.type)) throw new HttpError(400, 'type must be percent or fixed')
    d.type = body.type
  }
  if (body.value !== undefined || !partial) {
    const v = Number(body.value)
    if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new HttpError(400, 'value must be a positive number')
    d.value = v
  }
  if ((d.type ?? body.type) === 'percent' && d.value > 100) throw new HttpError(400, 'A percent coupon cannot exceed 100')
  for (const k of ['minSubtotal', 'usageLimit']) {
    if (body[k] === undefined || body[k] === '') continue
    const n = Number(body[k])
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} must be zero or more`)
    d[k] = k === 'usageLimit' ? Math.floor(n) : n
  }
  if (body.expiresAt !== undefined) {
    if (!body.expiresAt) d.expiresAt = null
    else {
      const t = new Date(body.expiresAt)
      if (Number.isNaN(t.getTime())) throw new HttpError(400, 'expiresAt must be a valid date')
      d.expiresAt = t.toISOString()
    }
  }
  if (typeof body.description === 'string') d.description = body.description.trim().slice(0, 200)
  if (body.active !== undefined) d.active = !!body.active
  return d
}

function cleanShipping(s) {
  if (!s || typeof s !== 'object') return undefined
  const pick = (k, max) => (typeof s[k] === 'string' ? s[k].trim().slice(0, max) : '')
  const out = { name: pick('name', 80), address: pick('address', 200), city: pick('city', 80), postalCode: pick('postalCode', 20) }
  return Object.values(out).some(Boolean) ? out : undefined
}

// Downscales an uploaded cover so it fits comfortably in localStorage.
async function fileToCover(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new HttpError(400, 'Cover must be a JPEG, PNG, WebP or GIF image')
  if (file.size > 2 * 1024 * 1024) throw new HttpError(400, 'Cover image must be 2MB or smaller')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new HttpError(400, 'Uploaded file is not a valid image'))
      i.src = url
    })
    const scale = Math.min(1, 360 / img.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function bodyToObject(body) {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const o = {}
    for (const [k, v] of body.entries()) o[k] = v
    if (o.cover instanceof File) o.image = await fileToCover(o.cover)
    delete o.cover
    return o
  }
  return body && typeof body === 'object' ? body : {}
}

function validateBook(body, partial) {
  const data = {}
  const fields = [['title', 200, true], ['author', 120, true], ['genre', 60], ['language', 40], ['description', 2000], ['excerpt', 4000]]
  for (const [key, max, required] of fields) {
    const raw = body[key]
    if (raw === undefined) {
      if (required && !partial) return { error: `${key} is required` }
      continue
    }
    if (typeof raw !== 'string') return { error: `${key} must be a string` }
    const v = raw.trim()
    if (required && !v) return { error: `${key} is required` }
    if (v.length > max) return { error: `${key} must be at most ${max} characters` }
    data[key] = v
  }
  if (body.price === undefined || body.price === '') {
    if (!partial) return { error: 'price is required' }
  } else {
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'price must be a number between 0 and 100000' }
    data.price = round2(price)
  }
  for (const [key, min, max] of [['stock', 0, 1000000], ['pages', 1, 20000]]) {
    if (body[key] === undefined || body[key] === '') continue
    const n = Number(body[key])
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${key} must be a whole number between ${min} and ${max}` }
    data[key] = n
  }
  if (typeof body.image === 'string' && body.image.trim()) {
    const url = body.image.trim()
    if (!url.startsWith('data:image/')) {
      let ok = false
      try {
        ok = ['http:', 'https:'].includes(new URL(url).protocol) && url.length <= 1000
      } catch {
        /* invalid */
      }
      if (!ok) return { error: 'image must be a valid http(s) URL (or upload a cover file)' }
    }
    data.image = url
  }
  return { data }
}

function paginate(list, query, defLimit, maxLimit) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defLimit, 1), maxLimit)
  return { page, limit, total: list.length, pages: Math.max(Math.ceil(list.length / limit), 1), slice: list.slice((page - 1) * limit, page * limit) }
}

const withUser = (db, o) => {
  const u = db.users.find((x) => x._id === o.user)
  return { ...o, user: u ? { _id: u._id, name: u.name, email: u.email } : null }
}

const readingFor = (db, userId) =>
  (db.reading[userId] || []).map((e) => ({ ...e, book: db.books.find((b) => b._id === e.book) })).filter((e) => e.book)

// ---------- routes ----------
const routes = []
const route = (method, pattern, handler, auth = false) =>
  routes.push({ method, auth, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler })

route('POST', '/api/auth/register', ({ db, body }) => {
  const name = norm(body.name)
  const email = norm(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!name || name.length > 80) throw new HttpError(400, 'Name is required (max 80 chars)')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required')
  if (password.length < 6 || password.length > 72) throw new HttpError(400, 'Password must be 6-72 characters')
  if (db.users.some((u) => u.email === email)) throw new HttpError(409, 'Email already registered')
  const user = { _id: nextId(db, 'u'), name, email, password, role: 'user' }
  db.users.push(user)
  return [201, { token: `demo-${user._id}`, user: publicUser(user) }]
})
route('POST', '/api/auth/login', ({ db, body }) => {
  const email = norm(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) throw new HttpError(400, 'Email and password are required')
  const user = db.users.find((u) => u.email === email)
  if (!user || user.password !== password) throw new HttpError(401, 'Invalid email or password')
  return { token: `demo-${user._id}`, user: publicUser(user) }
})
route('GET', '/api/auth/me', ({ user }) => ({ user: publicUser(user) }), true)
route('POST', '/api/auth/logout', () => ({ message: 'Logged out' }), true)

route('GET', '/api/books', ({ db, query: q }) => {
  let list = db.books.slice()
  if (norm(q.search)) list = list.filter((b) => has(b.title, norm(q.search)) || has(b.author, norm(q.search)))
  if (norm(q.genre)) list = list.filter((b) => b.genre === norm(q.genre))
  if (norm(q.language)) list = list.filter((b) => b.language === norm(q.language))
  if (norm(q.author)) list = list.filter((b) => b.author === norm(q.author))
  const min = numOrNaN(q.minPrice)
  const max = numOrNaN(q.maxPrice)
  if (Number.isFinite(min)) list = list.filter((b) => b.price >= min)
  if (Number.isFinite(max)) list = list.filter((b) => b.price <= max)
  const minRating = numOrNaN(q.minRating)
  if (Number.isFinite(minRating) && minRating > 0) list = list.filter((b) => b.rating >= minRating)
  if (q.inStock === '1' || q.inStock === 'true') list = list.filter((b) => b.stock > 0)
  list.sort(SORTS[q.sort] || SORTS.title)
  const p = paginate(list, q, 8, 50)
  const prices = db.books.map((b) => b.price)
  return {
    books: p.slice,
    page: p.page,
    limit: p.limit,
    total: p.total,
    pages: p.pages,
    genres: [...new Set(db.books.map((b) => b.genre).filter(Boolean))].sort(),
    languages: [...new Set(db.books.map((b) => b.language).filter(Boolean))].sort(),
    priceRange: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
  }
})
route('GET', '/api/books/featured', ({ db }) => {
  const counts = new Map()
  for (const b of db.books) if (b.genre) counts.set(b.genre, (counts.get(b.genre) || 0) + 1)
  return {
    bestsellers: db.books.filter((b) => b.stock > 0).sort(SORTS.bestselling).slice(0, 8),
    newArrivals: db.books.slice().sort(SORTS.newest).slice(0, 8),
    genres: [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    total: db.books.length,
  }
})
route('GET', '/api/books/author/:name', ({ db, params }) => {
  const name = decodeURIComponent(params.name).trim().toLowerCase()
  const books = db.books.filter((b) => b.author.toLowerCase() === name).sort(SORTS.newest)
  if (!books.length) throw new HttpError(404, 'Author not found')
  const rated = books.filter((b) => b.numReviews > 0)
  return {
    author: books[0].author,
    books,
    stats: {
      count: books.length,
      genres: [...new Set(books.map((b) => b.genre).filter(Boolean))],
      avgRating: rated.length ? round1(rated.reduce((s, b) => s + b.rating, 0) / rated.length) : 0,
      sold: books.reduce((s, b) => s + (b.sold || 0), 0),
    },
  }
})
route('GET', '/api/books/:id', ({ db, params }) => findBook(db, params.id))
route('GET', '/api/books/:id/related', ({ db, params }) => {
  const book = findBook(db, params.id)
  const together = new Map()
  for (const o of db.orders) {
    if (o.status === 'cancelled' || !o.items.some((i) => i.book === book._id)) continue
    for (const i of o.items) if (i.book !== book._id) together.set(i.book, (together.get(i.book) || 0) + 1)
  }
  const ids = [...together].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0])
  let books = ids.map((id) => db.books.find((b) => b._id === id)).filter(Boolean)
  if (books.length < 6) {
    const have = new Set([book._id, ...books.map((b) => b._id)])
    const more = db.books
      .filter((b) => !have.has(b._id) && (b.author === book.author || b.genre === book.genre))
      .sort((a, b) => (b.author === book.author) - (a.author === book.author) || b.rating - a.rating || b.sold - a.sold)
      .slice(0, 6 - books.length)
    books = books.concat(more)
  }
  return { books }
})
route('GET', '/api/books/:id/reviews', ({ db, params }) => {
  const book = findBook(db, params.id)
  const reviews = db.reviews.filter((r) => r.book === book._id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { reviews, rating: book.rating, numReviews: book.numReviews }
})
route('POST', '/api/books/:id/reviews', ({ db, params, body, user }) => {
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'rating must be an integer from 1 to 5')
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length > 1000) throw new HttpError(400, 'text must be at most 1000 characters')
  findBook(db, params.id)
  let review = db.reviews.find((r) => r.book === params.id && r.user === user._id)
  if (review) Object.assign(review, { rating, text, name: user.name })
  else {
    review = { _id: nextId(db, 'r'), book: params.id, user: user._id, name: user.name, rating, text, createdAt: new Date().toISOString() }
    db.reviews.push(review)
  }
  refreshRating(db, params.id)
  return [201, review]
}, true)
route('DELETE', '/api/books/:id/reviews/mine', ({ db, params, user }) => {
  const i = db.reviews.findIndex((r) => r.book === params.id && r.user === user._id)
  if (i < 0) throw new HttpError(404, 'You have not reviewed this book')
  db.reviews.splice(i, 1)
  refreshRating(db, params.id)
  return { deleted: true }
}, true)

route('POST', '/api/books', async ({ db, body, user }) => {
  requireAdmin(user)
  const { data, error } = validateBook(await bodyToObject(body), false)
  if (error) throw new HttpError(400, error)
  const book = {
    _id: nextId(db, 'b'),
    genre: '', language: 'English', description: '', excerpt: '', image: '', pages: 0,
    stock: 50, sold: 0, rating: 0, numReviews: 0,
    ...data,
    publishedAt: new Date().toISOString(),
  }
  db.books.push(book)
  return [201, book]
}, true)
route('PUT', '/api/books/:id', async ({ db, params, body, user }) => {
  requireAdmin(user)
  const { data, error } = validateBook(await bodyToObject(body), true)
  if (error) throw new HttpError(400, error)
  return Object.assign(findBook(db, params.id), data)
}, true)
route('DELETE', '/api/books/:id', ({ db, params, user }) => {
  requireAdmin(user)
  const book = findBook(db, params.id)
  db.books = db.books.filter((b) => b._id !== book._id)
  db.reviews = db.reviews.filter((r) => r.book !== book._id)
  return { deleted: true, id: book._id }
}, true)

route('GET', '/api/payments/config', () => ({ mode: 'demo' }))
route('POST', '/api/payments/checkout', ({ db, body, user }) => {
  const { lines, total: subtotal } = priceCart(db, body.items)
  const { coupon, discount } = resolveCoupon(db, body.couponCode, subtotal)
  const total = round2(subtotal - discount)
  if (coupon) coupon.used += 1
  for (const l of lines) {
    const b = db.books.find((x) => x._id === l.book)
    b.stock -= l.qty
    b.sold += l.qty
  }
  const now = new Date().toISOString()
  const order = { _id: nextId(db, 'o'), user: user._id, items: lines, subtotal, discount, couponCode: coupon?.code, total, shipping: cleanShipping(body.shipping), paymentStatus: 'paid (demo)', status: 'placed', createdAt: now, updatedAt: now }
  db.orders.unshift(order)
  return [201, { mode: 'mock', order }]
}, true)
route('POST', '/api/coupons/validate', ({ db, body }) => {
  if (typeof body.code !== 'string' || !body.code.trim()) throw new HttpError(400, 'Enter a coupon code')
  const { total } = priceCart(db, body.items)
  const { coupon, discount, message } = resolveCoupon(db, body.code, total)
  return { message, discount, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description } }
}, true)
route('GET', '/api/admin/coupons', ({ db, user }) => (requireAdmin(user), db.coupons), true)
route('POST', '/api/admin/coupons', ({ db, body, user }) => {
  requireAdmin(user)
  const d = parseCoupon(body, false)
  if (db.coupons.some((c) => c.code === d.code)) throw new HttpError(409, 'A coupon with this code already exists')
  const coupon = { _id: nextId(db, 'c'), description: '', minSubtotal: 0, expiresAt: null, usageLimit: 0, used: 0, active: true, ...d }
  db.coupons.unshift(coupon)
  return [201, coupon]
}, true)
route('PUT', '/api/admin/coupons/:id', ({ db, params, body, user }) => {
  requireAdmin(user)
  const coupon = db.coupons.find((c) => c._id === params.id)
  if (!coupon) throw new HttpError(404, 'Coupon not found')
  const d = parseCoupon(body, true)
  if (d.code && db.coupons.some((c) => c.code === d.code && c !== coupon)) throw new HttpError(409, 'A coupon with this code already exists')
  Object.assign(coupon, d)
  return coupon
}, true)
route('DELETE', '/api/admin/coupons/:id', ({ db, params, user }) => {
  requireAdmin(user)
  const coupon = db.coupons.find((c) => c._id === params.id)
  if (!coupon) throw new HttpError(404, 'Coupon not found')
  db.coupons = db.coupons.filter((c) => c !== coupon)
  return { deleted: true, id: coupon._id }
}, true)
route('GET', '/api/orders/mine', ({ db, user }) => db.orders.filter((o) => o.user === user._id), true)
route('POST', '/api/orders/:id/reorder', ({ db, params, user }) => {
  const order = db.orders.find((o) => o._id === params.id && o.user === user._id)
  if (!order) throw new HttpError(404, 'Order not found')
  const items = []
  const unavailable = []
  for (const it of order.items) {
    const b = db.books.find((x) => x._id === it.book)
    if (!b || b.stock < 1) unavailable.push(it.title)
    else items.push({ _id: b._id, title: b.title, author: b.author, genre: b.genre, price: b.price, image: b.image, qty: Math.min(it.qty, b.stock, 20) })
  }
  return { items, unavailable }
}, true)

route('GET', '/api/me/reading-list', ({ db, user }) => readingFor(db, user._id), true)
route('PUT', '/api/me/reading-list/:bookId', ({ db, params, body, user }) => {
  const status = body.status ?? 'want'
  if (!READING.includes(status)) throw new HttpError(400, `status must be one of: ${READING.join(', ')}`)
  findBook(db, params.bookId)
  const list = (db.reading[user._id] ||= [])
  const e = list.find((x) => x.book === params.bookId)
  if (e) e.status = status
  else list.push({ book: params.bookId, status, addedAt: new Date().toISOString() })
  return readingFor(db, user._id)
}, true)
route('DELETE', '/api/me/reading-list/:bookId', ({ db, params, user }) => {
  db.reading[user._id] = (db.reading[user._id] || []).filter((x) => x.book !== params.bookId)
  return readingFor(db, user._id)
}, true)

route('GET', '/api/admin/orders', ({ db, query: q, user }) => {
  requireAdmin(user)
  let list = db.orders
  if (STATUSES.includes(q.status)) list = list.filter((o) => o.status === q.status)
  const p = paginate(list, q, 20, 100)
  return { orders: p.slice.map((o) => withUser(db, o)), page: p.page, limit: p.limit, total: p.total, pages: p.pages }
}, true)
route('PATCH', '/api/admin/orders/:id/status', ({ db, params, body, user }) => {
  requireAdmin(user)
  if (!STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`)
  const order = db.orders.find((o) => o._id === params.id)
  if (!order) throw new HttpError(404, 'Order not found')
  order.status = body.status
  order.updatedAt = new Date().toISOString()
  return withUser(db, order)
}, true)
route('GET', '/api/admin/stats', ({ db, query: q, user }) => {
  requireAdmin(user)
  const days = Math.min(Math.max(parseInt(q.days, 10) || 30, 7), 365)
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))
  const live = db.orders.filter((o) => o.status !== 'cancelled')
  const byDay = new Map()
  for (const o of live) {
    if (new Date(o.createdAt) < since) continue
    const key = o.createdAt.slice(0, 10)
    const row = byDay.get(key) || { revenue: 0, orders: 0 }
    row.revenue += o.total
    row.orders += 1
    byDay.set(key, row)
  }
  const salesByDay = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    const row = byDay.get(key)
    salesByDay.push({ date: key, revenue: round2(row?.revenue || 0), orders: row?.orders || 0 })
  }
  const units = new Map()
  for (const o of live) {
    for (const i of o.items) {
      const t = units.get(i.book) || { id: i.book, title: i.title, units: 0, revenue: 0 }
      t.units += i.qty
      t.revenue += i.qty * i.price
      units.set(i.book, t)
    }
  }
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const o of db.orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  const low = db.books.filter((b) => b.stock <= 5).sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title))
  return {
    totals: { revenue: round2(live.reduce((s, o) => s + o.total, 0)), orders: live.length, books: db.books.length, users: db.users.length, lowStock: low.length },
    salesByDay,
    topBooks: [...units.values()].sort((a, b) => b.units - a.units).slice(0, 5).map((t) => ({ ...t, revenue: round2(t.revenue) })),
    statusCounts,
    lowStock: low.slice(0, 10).map((b) => ({ _id: b._id, title: b.title, author: b.author, stock: b.stock })),
  }
}, true)

// ---------- entry point ----------
export async function demoRequest(path, { method = 'GET', body, token } = {}) {
  await sleep(90 + Math.random() * 230) // realistic latency
  const u = new URL(path, 'http://demo.local')
  const db = load()
  const query = Object.fromEntries(u.searchParams)
  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.re.exec(u.pathname)
    if (!m) continue
    const user = r.auth ? authUser(db, token) : null
    const out = await r.handler({ db, params: m.groups || {}, query, body: body ?? {}, user })
    const data = Array.isArray(out) && typeof out[0] === 'number' ? out[1] : out
    if (method !== 'GET') save()
    return JSON.parse(JSON.stringify(data)) // behave like a JSON response (no shared references)
  }
  throw new HttpError(404, 'Not found')
}
