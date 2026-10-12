// Staff and admin routes: orders, inventory, ISBN import, moderation, users, settings, coupons, gift cards, reports and exports.
import { route, fail, str, text, int, num, notify, getSettings, paginate, sortBy } from './framework.mjs'
import { 
  ORDER_STATUSES, ROLES, DEFAULT_SETTINGS, mergeSettings, tierFor, isPhysical, isDigital, toIsbn13, round2, shortId, toCsv, dayKey, addDays, deriveBook, isUpcoming, COUNTRIES, FORMATS,
 } from './rules.mjs'
import { getBooks, nowOf, bookOut, refreshRating, createBook, validateBook } from './m-catalog.mjs'
import { reverseOrder, giftCardsUsed, settlePreorders, newGiftCode } from './m-shop.mjs'

const isId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{2,40}$/.test(s)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const giftTotal = (o) => o.items.filter((i) => i.kind === 'giftcard').reduce((s, i) => s + i.price * i.qty, 0)
export const orderRevenue = (o) => round2((o.total || 0) - giftTotal(o) - (o.refundedTotal || 0))
const safeUser = (u, settings) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, disabled: !!u.disabled, country: u.country || 'US', points: u.points || 0, lifetimePoints: u.lifetimePoints || 0, tier: tierFor(u.lifetimePoints || 0, settings).id, createdAt: u.createdAt })

// ---------- overview for staff ----------
route('GET', '/api/staff/overview', 'staff', async ({ ctx }) => {
  await settlePreorders(ctx)
  const orders = await ctx.store.find('orders', {}, { sort: { createdAt: -1 } })
  const books = await getBooks(ctx)
  const now = nowOf(ctx)
  const users = new Map((await ctx.store.find('users', {})).map((u) => [String(u._id), u]))
  const reviews = await ctx.store.find('reviews', {})
  const qs = await ctx.store.find('questions', {})
  const rets = await ctx.store.find('returns', {})
  const low = books.filter((b) => b.formats.some((f) => isPhysical(f.type)) && !isUpcoming(b, now) && b.stock <= 5).sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title))
  const day = dayKey(now)
  return {
    counts: {
      toShip: orders.filter((o) => ['placed', 'processing'].includes(o.status) && o.items.some((i) => i.kind !== 'giftcard' && isPhysical(i.format || 'paperback'))).length,
      preorders: orders.filter((o) => o.status === 'preorder').length,
      returnsOpen: rets.filter((r) => ['requested', 'approved', 'received'].includes(r.status)).length,
      reviewsReported: reviews.filter((r) => (r.reports || 0) > 0 && !r.hidden).length,
      questionsOpen: qs.filter((q) => !q.hidden && !(q.answers || []).length).length,
      lowStock: low.length,
      today: orders.filter((o) => dayKey(o.createdAt) === day && o.status !== 'cancelled').length,
    },
    lowStock: low.slice(0, 8).map((b) => ({ _id: b._id, title: b.title, author: b.author, stock: b.stock })),
    recentOrders: orders.slice(0, 6).map((o) => ({ _id: o._id, status: o.status, total: o.total, createdAt: o.createdAt, customer: users.get(String(o.user))?.name || 'Deleted user' })),
  }
})

// ---------- orders ----------
route('GET', '/api/admin/orders', 'staff', async ({ ctx, query }) => {
  await settlePreorders(ctx)
  let rows = await ctx.store.find('orders', {}, { sort: { createdAt: -1 } })
  const users = new Map((await ctx.store.find('users', {})).map((u) => [String(u._id), u]))
  if (ORDER_STATUSES.includes(query.status)) rows = rows.filter((o) => o.status === query.status)
  if (query.kind === 'digital') rows = rows.filter((o) => o.items.some((i) => i.kind !== 'giftcard' && isDigital(i.format)))
  if (query.kind === 'physical') rows = rows.filter((o) => o.items.some((i) => i.kind !== 'giftcard' && isPhysical(i.format || 'paperback')))
  const q = str(query.q).toLowerCase()
  if (q) rows = rows.filter((o) => shortId(o._id).toLowerCase().includes(q.replace('#', '')) || [users.get(String(o.user))?.name, users.get(String(o.user))?.email].some((v) => String(v || '').toLowerCase().includes(q)))
  const p = paginate(rows, query, 20, 100)
  return { orders: p.slice.map((o) => ({ ...o, user: users.get(String(o.user)) ? { _id: o.user, name: users.get(String(o.user)).name, email: users.get(String(o.user)).email } : null })), page: p.page, limit: p.limit, total: p.total, pages: p.pages }
})

route('PATCH', '/api/admin/orders/:id/status', 'staff', async ({ ctx, params, body }) => {
  if (!isId(params.id)) fail(400, 'Invalid order id')
  const status = body.status
  if (!ORDER_STATUSES.includes(status)) fail(400, `status must be one of: ${ORDER_STATUSES.join(', ')}`)
  const order = await ctx.store.get('orders', params.id)
  if (!order) fail(404, 'Order not found')
  if (order.status === 'cancelled' && status !== 'cancelled') fail(409, 'Cancelled orders cannot be reopened')
  if (status === 'cancelled' && order.status !== 'cancelled') {
    if (await giftCardsUsed(ctx, order)) fail(409, 'A gift card from this order has already been used')
    await reverseOrder(ctx, order)
  }
  const patch = { status, updatedAt: ctx.now(), ...(status === 'delivered' && order.status !== 'delivered' ? { deliveredAt: ctx.now() } : {}) }
  const updated = await ctx.store.update('orders', order._id, patch)
  if (status !== order.status && ['shipped', 'delivered', 'cancelled', 'processing'].includes(status)) {
    await notify(ctx, order.user, { type: 'order', title: `Order #${shortId(order._id)} ${status === 'processing' ? 'is being prepared' : status}`, body: status === 'delivered' ? 'Enjoy your books! You can request a return within the return window.' : '', link: '/orders' })
  }
  const u = await ctx.store.get('users', order.user)
  return { ...updated, user: u ? { _id: u._id, name: u.name, email: u.email } : null }
})

// ---------- inventory ----------
route('GET', '/api/staff/inventory', 'staff', async ({ ctx, query }) => {
  const now = nowOf(ctx)
  let books = await getBooks(ctx)
  const q = str(query.q).toLowerCase()
  if (q) books = books.filter((b) => `${b.title} ${b.author} ${b.isbn || ''} ${b.formats.map((f) => f.isbn || '').join(' ')}`.toLowerCase().includes(q))
  if (query.filter === 'low') books = books.filter((b) => b.formats.some((f) => isPhysical(f.type) && f.stock > 0 && f.stock <= 5))
  if (query.filter === 'out') books = books.filter((b) => b.formats.some((f) => isPhysical(f.type) && f.stock === 0))
  if (query.filter === 'preorder') books = books.filter((b) => isUpcoming(b, now))
  books = sortBy(books, query.sort === 'stock' ? 'stock' : 'title')
  const p = paginate(books, query, 15, 100)
  return { books: p.slice.map((b) => bookOut(b, now)), page: p.page, limit: p.limit, total: p.total, pages: p.pages }
})
route('GET', '/api/staff/stock-moves', 'staff', async ({ ctx, query }) => {
  const filter = isId(str(query.book)) ? { book: str(query.book) } : {}
  const rows = await ctx.store.find('stockMoves', filter, { sort: { createdAt: -1 }, limit: 40 })
  const books = new Map((await ctx.store.find('books', {})).map((b) => [String(b._id), b.title]))
  const users = new Map((await ctx.store.find('users', {})).map((u) => [String(u._id), u.name]))
  return rows.map((r) => ({ ...r, title: books.get(String(r.book)) || 'Deleted book', by: users.get(String(r.by)) || 'Staff' }))
})

// ---------- ISBN lookup (Open Library, no API key) ----------
const SUBJECT_GENRES = [
  [/science fiction|sci-fi/i, 'Science Fiction'], [/fantasy|magic|dragons/i, 'Fantasy'], [/mystery|detective|crime/i, 'Mystery'], [/romance|love stories/i, 'Romance'],
  [/historical|history/i, 'Historical Fiction'], [/poetry|poems/i, 'Poetry'], [/computer|programming|software/i, 'Technology'], [/nature|science|biology|physics/i, 'Science & Nature'],
]
function parseDate(s) {
  if (!s) return ''
  const t = String(s).trim()
  // ISO-like dates are UTC already; text such as "March 3, 2019" would otherwise be read in the server's time zone
  const d = new Date(/^\d{4}$/.test(t) ? `${t}-01-01` : /^\d{4}-\d{2}(-\d{2})?/.test(t) ? t : `${t} UTC`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}
export async function lookupIsbn(ctx, raw) {
  const isbn = toIsbn13(raw)
  if (!isbn) fail(400, 'Enter a valid ISBN-10 or ISBN-13')
  const books = await ctx.store.find('books', {})
  const hit = books.find((b) => b.isbn === isbn || (b.formats || []).some((f) => f.isbn === isbn))
  const existing = hit ? { _id: hit._id, title: hit.title, author: hit.author } : null
  try {
    if (!ctx.fetch) throw new Error('no fetch')
    const ctl = typeof AbortController === 'function' ? new AbortController() : null
    const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null
    const res = await ctx.fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { signal: ctl?.signal }).finally(() => timer && clearTimeout(timer))
    if (!res.ok) throw new Error(`status ${res.status}`)
    const row = (await res.json())[`ISBN:${isbn}`]
    if (!row) return { isbn, found: false, source: 'openlibrary', existing, message: 'Open Library has no record of this ISBN. Enter the details by hand.' }
    const subjects = (row.subjects || []).map((s) => s.name).slice(0, 8)
    return {
      isbn,
      found: true,
      source: 'openlibrary',
      existing,
      data: {
        title: [row.title, row.subtitle].filter(Boolean).join(': ').slice(0, 200),
        author: (row.authors || []).map((a) => a.name).join(', ').slice(0, 120) || 'Unknown author',
        publisher: (row.publishers || [])[0]?.name?.slice(0, 120) || '',
        pages: row.number_of_pages || undefined,
        publishedAt: parseDate(row.publish_date),
        genre: (SUBJECT_GENRES.find(([re]) => subjects.some((s) => re.test(s))) || [])[1] || '',
        image: row.cover?.medium || row.cover?.large || '',
        subjects,
        language: 'English',
      },
    }
  } catch {
    return { isbn, found: false, offline: true, source: 'none', existing, message: 'Could not reach Open Library, so nothing was filled in. Enter the details by hand; you can look the ISBN up again later.' }
  }
}
route('GET', '/api/staff/isbn/:isbn', 'staff', async ({ ctx, params }) => lookupIsbn(ctx, params.isbn))

route('POST', '/api/staff/isbn/import', 'staff', async ({ ctx, body }) => {
  const isbn = toIsbn13(body.isbn)
  if (!isbn) fail(400, 'Enter a valid ISBN-10 or ISBN-13')
  const stock = int(body.stock, { min: 0, max: 100000, label: 'stock', def: 10 })
  const price = num(body.price, { min: 0, max: 100000, label: 'price' })
  const formats = [{ type: 'paperback', price, stock, isbn }]
  const data = validateBook({ title: body.title, author: body.author, genre: body.genre, language: body.language || 'English', description: body.description, publisher: body.publisher, pages: body.pages || undefined, publishedAt: body.publishedAt || undefined, image: body.image || undefined, isbn, formats }, false)
  const books = await ctx.store.find('books', {})
  if (books.some((b) => b.isbn === isbn || (b.formats || []).some((f) => f.isbn === isbn))) fail(409, 'A book with this ISBN already exists')
  const book = await createBook(ctx, data)
  return [201, { action: 'created', book: bookOut(deriveBook(book), nowOf(ctx)) }]
})

// Type an ISBN and a quantity: restocks a known title, or looks it up and creates it.
route('POST', '/api/staff/quick-add', 'staff', async ({ ctx, body, user }) => {
  const isbn = toIsbn13(body.isbn)
  if (!isbn) fail(400, 'Enter a valid ISBN-10 or ISBN-13')
  const qty = int(body.qty, { min: 1, max: 10000, label: 'quantity', def: 1 })
  const books = await ctx.store.find('books', {})
  const hit = books.find((b) => b.isbn === isbn || (b.formats || []).some((f) => f.isbn === isbn))
  if (hit) {
    const b = deriveBook(hit)
    const f = b.formats.find((x) => x.isbn === isbn && isPhysical(x.type)) || b.formats.find((x) => isPhysical(x.type))
    if (!f) fail(400, 'This title has no physical edition to restock')
    const formats = b.formats.map((x) => (x.type === f.type ? { ...x, stock: x.stock + qty } : x))
    const merged = deriveBook({ ...b, formats })
    const after = await ctx.store.update('books', b._id, { formats: merged.formats, price: merged.price, stock: merged.stock })
    await ctx.store.insert('stockMoves', { book: String(b._id), format: f.type, from: f.stock, to: f.stock + qty, by: String(user._id), reason: 'Quick add', createdAt: ctx.now() })
    return { action: 'restocked', book: bookOut(deriveBook(after), nowOf(ctx)), added: qty }
  }
  const look = await lookupIsbn(ctx, isbn)
  const d = look.data || {}
  const title = str(body.title) || d.title
  const author = str(body.author) || d.author
  if (!title || !author) fail(404, look.offline ? 'Could not reach Open Library and this ISBN is not in the catalogue yet. Use Add by ISBN to enter the details.' : 'No details were found for this ISBN. Use Add by ISBN to enter them by hand.')
  const price = body.price === undefined || body.price === '' ? 14.99 : num(body.price, { min: 0, max: 100000, label: 'price' })
  const data = validateBook({ title, author, genre: d.genre || undefined, publisher: d.publisher, pages: d.pages || undefined, publishedAt: d.publishedAt || undefined, image: d.image || undefined, isbn, formats: [{ type: 'paperback', price, stock: qty, isbn }] }, false)
  const book = await createBook(ctx, data)
  return [201, { action: 'created', book: bookOut(deriveBook(book), nowOf(ctx)), added: qty, source: look.source }]
})

// ---------- moderation ----------
route('GET', '/api/staff/reviews', 'staff', async ({ ctx, query }) => {
  let rows = await ctx.store.find('reviews', {}, { sort: { createdAt: -1 } })
  if (query.filter === 'reported') rows = rows.filter((r) => (r.reports || 0) > 0 && !r.hidden)
  else if (query.filter === 'hidden') rows = rows.filter((r) => r.hidden)
  const books = new Map((await ctx.store.find('books', {})).map((b) => [String(b._id), b.title]))
  const p = paginate(rows, query, 20, 100)
  return { reviews: p.slice.map((r) => ({ _id: r._id, book: r.book, bookTitle: books.get(String(r.book)) || 'Deleted book', name: r.name, rating: r.rating, text: r.text, spoiler: !!r.spoiler, reports: r.reports || 0, lastReport: r.lastReport || '', hidden: !!r.hidden, hiddenReason: r.hiddenReason || '', createdAt: r.createdAt })), page: p.page, pages: p.pages, total: p.total }
})
route('POST', '/api/staff/reviews/:rid/hide', 'staff', async ({ ctx, params, body }) => {
  const r = await ctx.store.get('reviews', params.rid)
  if (!r) fail(404, 'Review not found')
  const hidden = body.hidden !== false
  await ctx.store.update('reviews', r._id, { hidden, hiddenReason: hidden ? text(body, 'reason', { max: 160 }) || 'Hidden by staff' : '', reports: 0, reporters: [] })
  await refreshRating(ctx, r.book)
  if (hidden && r.user) await notify(ctx, r.user, { type: 'review', title: 'Your review was hidden', body: 'It did not follow our community guidelines. You can edit it to restore it.', link: `/books/${r.book}` })
  return { hidden }
})
route('POST', '/api/staff/reviews/:rid/dismiss', 'staff', async ({ ctx, params }) => {
  const r = await ctx.store.get('reviews', params.rid)
  if (!r) fail(404, 'Review not found')
  await ctx.store.update('reviews', r._id, { reports: 0, reporters: [] })
  return { dismissed: true }
})
route('DELETE', '/api/staff/reviews/:rid', 'staff', async ({ ctx, params }) => {
  const r = await ctx.store.get('reviews', params.rid)
  if (!r) fail(404, 'Review not found')
  await ctx.store.remove('reviews', r._id)
  await refreshRating(ctx, r.book)
  return { deleted: true }
})
route('GET', '/api/staff/questions', 'staff', async ({ ctx, query }) => {
  let rows = await ctx.store.find('questions', {}, { sort: { createdAt: -1 } })
  if (query.status !== 'all') rows = rows.filter((q) => !q.hidden && !(q.answers || []).length)
  const books = new Map((await ctx.store.find('books', {})).map((b) => [String(b._id), b.title]))
  return rows.slice(0, 100).map((q) => ({ ...q, bookTitle: books.get(String(q.book)) || 'Deleted book' }))
})

// ---------- users (admin) ----------
route('GET', '/api/admin/users', 'admin', async ({ ctx, query }) => {
  const settings = await getSettings(ctx)
  let rows = await ctx.store.find('users', {}, { sort: { createdAt: -1 } })
  if (ROLES.includes(query.role)) rows = rows.filter((u) => u.role === query.role)
  const q = str(query.q).toLowerCase()
  if (q) rows = rows.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q))
  const p = paginate(rows, query, 20, 100)
  const counts = new Map()
  for (const o of await ctx.store.find('orders', {})) counts.set(String(o.user), (counts.get(String(o.user)) || 0) + 1)
  return { users: p.slice.map((u) => ({ ...safeUser(u, settings), orders: counts.get(String(u._id)) || 0 })), page: p.page, pages: p.pages, total: p.total }
})
route('POST', '/api/admin/users', 'admin', async ({ ctx, body }) => {
  const name = text(body, 'name', { max: 80, required: true, label: 'Name' })
  const email = str(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!EMAIL_RE.test(email)) fail(400, 'A valid email is required')
  if (password.length < 6 || password.length > 72) fail(400, 'Password must be 6-72 characters')
  if (!ROLES.includes(body.role)) fail(400, `role must be one of: ${ROLES.join(', ')}`)
  if (await ctx.store.one('users', { email })) fail(409, 'Email already registered')
  const u = await ctx.store.insert('users', { name, email, password: await ctx.hash(password), role: body.role, tokenVersion: 0, points: 0, lifetimePoints: 0, country: 'US', readingList: [], goal: null, createdAt: ctx.now() })
  return [201, safeUser(u, await getSettings(ctx))]
})
route('PATCH', '/api/admin/users/:id', 'admin', async ({ ctx, params, body, user }) => {
  const u = isId(params.id) ? await ctx.store.get('users', params.id) : null
  if (!u) fail(404, 'User not found')
  const patch = {}
  const self = String(u._id) === String(user._id)
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) fail(400, `role must be one of: ${ROLES.join(', ')}`)
    if (self && body.role !== 'admin') fail(409, 'You cannot change your own role')
    if (u.role === 'admin' && body.role !== 'admin' && (await ctx.store.count('users', { role: 'admin' })) <= 1) fail(409, 'The store needs at least one admin')
    patch.role = body.role
  }
  if (body.disabled !== undefined) {
    if (self) fail(409, 'You cannot disable your own account')
    patch.disabled = !!body.disabled
  }
  if (body.name !== undefined) patch.name = text(body, 'name', { max: 80, required: true, label: 'Name' })
  if (patch.role || patch.disabled) patch.tokenVersion = (u.tokenVersion || 0) + 1
  const out = Object.keys(patch).length ? await ctx.store.update('users', u._id, patch) : u
  return safeUser(out, await getSettings(ctx))
})
route('POST', '/api/admin/users/:id/points', 'admin', async ({ ctx, params, body, user }) => {
  const u = isId(params.id) ? await ctx.store.get('users', params.id) : null
  if (!u) fail(404, 'User not found')
  const delta = int(body.delta, { min: -100000, max: 100000, label: 'points' })
  if ((u.points || 0) + delta < 0) fail(400, 'A balance cannot go below zero')
  await ctx.store.atomic('users', { _id: u._id }, { $inc: { points: delta, ...(delta > 0 ? { lifetimePoints: delta } : {}) } })
  await ctx.store.insert('pointsLedger', { user: String(u._id), delta, type: 'adjust', note: text(body, 'note', { max: 120 }) || `Adjusted by ${user.name}`, createdAt: ctx.now() })
  await notify(ctx, u._id, { type: 'points', title: delta > 0 ? `You received ${delta} reward points` : 'Your reward points were adjusted', body: text(body, 'note', { max: 120 }) || '', link: '/account' })
  return safeUser(await ctx.store.get('users', u._id), await getSettings(ctx))
})

// ---------- settings (admin) ----------
function checkSettings(body, base) {
  const out = mergeSettings(body, base)
  const inRange = (v, lo, hi, label) => {
    if (!Number.isFinite(v) || v < lo || v > hi) fail(400, `${label} must be between ${lo} and ${hi}`)
  }
  const s = out.shipping
  for (const k of ['standard', 'express', 'international', 'freeOver']) inRange(s[k], 0, 1000, `shipping ${k}`)
  inRange(out.giftWrap, 0, 100, 'gift wrap price')
  const l = out.loyalty
  inRange(l.earnPerDollar, 0, 20, 'points per dollar')
  inRange(l.pointValue, 0.001, 1, 'point value')
  inRange(l.maxRedeemPct, 0, 100, 'maximum redemption percent')
  inRange(l.silverAt, 0, 1e6, 'silver threshold')
  inRange(l.goldAt, 0, 1e6, 'gold threshold')
  if (l.goldAt <= l.silverAt) fail(400, 'The gold threshold must be higher than the silver threshold')
  inRange(l.silverBonus, 0, 2, 'silver bonus')
  inRange(l.goldBonus, 0, 2, 'gold bonus')
  inRange(out.returns.windowDays, 0, 365, 'return window')
  inRange(out.giftCards.min, 1, 1000, 'gift card minimum')
  inRange(out.giftCards.max, out.giftCards.min, 5000, 'gift card maximum')
  for (const [code, r] of Object.entries(out.tax)) {
    if (!/^[A-Z]{2}$/.test(code)) fail(400, `Invalid country code ${code}`)
    inRange(r.physical, 0, 1, `${code} physical tax`)
    inRange(r.digital, 0, 1, `${code} digital tax`)
  }
  if (!out.tax[s.homeCountry]) fail(400, 'The home country needs a tax entry')
  const name = String(out.storeName || '').trim()
  if (!name || name.length > 60) fail(400, 'Store name is required (max 60 characters)')
  return out
}
route('GET', '/api/admin/settings', 'admin', async ({ ctx }) => ({ ...(await getSettings(ctx)), countries: COUNTRIES }))
route('PUT', '/api/admin/settings', 'admin', async ({ ctx, body }) => {
  const current = await getSettings(ctx)
  const next = checkSettings(mergeSettings(body, current), DEFAULT_SETTINGS)
  const have = await ctx.store.get('settings', 'main')
  if (have) await ctx.store.update('settings', 'main', { value: next })
  else await ctx.store.insert('settings', { _id: 'main', value: next })
  return { ...next, countries: COUNTRIES }
})

// ---------- coupons (admin) ----------
function parseCoupon(body, partial) {
  const d = {}
  if (body.code !== undefined || !partial) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail(400, 'code must be 3-30 letters, digits, - or _')
    d.code = code
  }
  if (body.type !== undefined || !partial) {
    if (!['percent', 'fixed'].includes(body.type)) fail(400, 'type must be percent or fixed')
    d.type = body.type
  }
  if (body.value !== undefined || !partial) {
    const v = Number(body.value)
    if (!Number.isFinite(v) || v <= 0 || v > 100000) fail(400, 'value must be a positive number')
    d.value = v
  }
  for (const k of ['minSubtotal', 'usageLimit']) {
    if (body[k] === undefined || body[k] === '') continue
    const n = Number(body[k])
    if (!Number.isFinite(n) || n < 0) fail(400, `${k} must be zero or more`)
    d[k] = k === 'usageLimit' ? Math.floor(n) : n
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === '') d.expiresAt = null
    else {
      const t = new Date(body.expiresAt)
      if (Number.isNaN(t.getTime())) fail(400, 'expiresAt must be a valid date')
      d.expiresAt = t.toISOString()
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 200) fail(400, 'description must be at most 200 characters')
    d.description = body.description.trim()
  }
  if (body.active !== undefined) d.active = !!body.active
  return d
}
route('GET', '/api/admin/coupons', 'admin', async ({ ctx }) => ctx.store.find('coupons', {}, { sort: { createdAt: -1 } }))
route('POST', '/api/admin/coupons', 'admin', async ({ ctx, body }) => {
  const d = parseCoupon(body, false)
  if (d.type === 'percent' && d.value > 100) fail(400, 'A percent coupon cannot exceed 100')
  if (await ctx.store.one('coupons', { code: d.code })) fail(409, 'A coupon with this code already exists')
  return [201, await ctx.store.insert('coupons', { description: '', minSubtotal: 0, expiresAt: null, usageLimit: 0, used: 0, active: true, ...d, createdAt: ctx.now() })]
})
route('PUT', '/api/admin/coupons/:id', 'admin', async ({ ctx, params, body }) => {
  const c = isId(params.id) ? await ctx.store.get('coupons', params.id) : null
  if (!c) fail(isId(params.id) ? 404 : 400, isId(params.id) ? 'Coupon not found' : 'Invalid coupon id')
  const d = parseCoupon(body, true)
  if ((d.type ?? c.type) === 'percent' && (d.value ?? c.value) > 100) fail(400, 'A percent coupon cannot exceed 100')
  if (d.code && d.code !== c.code && (await ctx.store.one('coupons', { code: d.code }))) fail(409, 'A coupon with this code already exists')
  return ctx.store.update('coupons', c._id, d)
})
route('DELETE', '/api/admin/coupons/:id', 'admin', async ({ ctx, params }) => {
  if (!isId(params.id)) fail(400, 'Invalid coupon id')
  if (!(await ctx.store.remove('coupons', params.id))) fail(404, 'Coupon not found')
  return { deleted: true, id: params.id }
})

// ---------- gift cards (admin) ----------
route('GET', '/api/admin/giftcards', 'admin', async ({ ctx }) => ctx.store.find('giftcards', {}, { sort: { createdAt: -1 }, limit: 200 }))
route('POST', '/api/admin/giftcards', 'admin', async ({ ctx, body, user }) => {
  const settings = await getSettings(ctx)
  const amount = num(body.amount, { min: settings.giftCards.min, max: settings.giftCards.max, label: 'amount' })
  const toEmail = str(body.toEmail).toLowerCase()
  if (toEmail && !EMAIL_RE.test(toEmail)) fail(400, 'Enter a valid recipient email')
  let code
  do code = newGiftCode(ctx)
  while (await ctx.store.one('giftcards', { code }))
  const card = await ctx.store.insert('giftcards', { code, balance: round2(amount), initial: round2(amount), purchaser: String(user._id), toName: '', toEmail, message: text(body, 'note', { max: 200 }) || 'Complimentary gift card', complimentary: true, createdAt: ctx.now() })
  if (toEmail) {
    const r = await ctx.store.one('users', { email: toEmail })
    if (r) await notify(ctx, r._id, { type: 'giftcard', title: 'You received a gift card', body: `A $${amount.toFixed(2)} gift card is waiting in your account.`, link: '/account' })
  }
  return [201, card]
})
route('PATCH', '/api/admin/giftcards/:id', 'admin', async ({ ctx, params, body }) => {
  const c = isId(params.id) ? await ctx.store.get('giftcards', params.id) : null
  if (!c) fail(404, 'Gift card not found')
  return ctx.store.update('giftcards', c._id, { disabled: !!body.disabled })
})

// ---------- dashboard numbers and reports (admin) ----------
route('GET', '/api/admin/stats', 'admin', async ({ ctx, query }) => {
  const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 7), 365)
  const since = new Date(ctx.now())
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))
  const orders = await ctx.store.find('orders', {})
  const live = orders.filter((o) => o.status !== 'cancelled' && !/^(pending|expired)/.test(o.paymentStatus || ''))
  const byDay = new Map()
  for (const o of live) {
    if (new Date(o.createdAt) < since) continue
    const key = dayKey(o.createdAt)
    const row = byDay.get(key) || { revenue: 0, orders: 0 }
    row.revenue += orderRevenue(o)
    row.orders += 1
    byDay.set(key, row)
  }
  const salesByDay = []
  for (let i = 0; i < days; i++) {
    const key = dayKey(new Date(since.getTime() + i * 86400000))
    const row = byDay.get(key)
    salesByDay.push({ date: key, revenue: round2(row?.revenue || 0), orders: row?.orders || 0 })
  }
  const units = new Map()
  for (const o of live) for (const i of o.items) {
    if (i.kind === 'giftcard') continue
    const t = units.get(String(i.book)) || { id: String(i.book), title: i.title, units: 0, revenue: 0 }
    t.units += i.qty
    t.revenue += i.qty * i.price
    units.set(String(i.book), t)
  }
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
  for (const o of orders) statusCounts[o.status || 'placed'] = (statusCounts[o.status || 'placed'] || 0) + 1
  const now = nowOf(ctx)
  const books = await getBooks(ctx)
  const low = books.filter((b) => b.formats.some((f) => isPhysical(f.type)) && !isUpcoming(b, now) && b.stock <= 5).sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title))
  return {
    totals: { revenue: round2(live.reduce((s, o) => s + orderRevenue(o), 0)), orders: live.length, books: books.length, users: await ctx.store.count('users', {}), lowStock: low.length },
    salesByDay,
    topBooks: [...units.values()].sort((a, b) => b.units - a.units).slice(0, 5).map((t) => ({ ...t, revenue: round2(t.revenue) })),
    statusCounts,
    lowStock: low.slice(0, 10).map((b) => ({ _id: b._id, title: b.title, author: b.author, stock: b.stock })),
  }
})

async function reportData(ctx, from, to) {
  const settings = await getSettings(ctx)
  const orders = (await ctx.store.find('orders', {})).filter((o) => o.status !== 'cancelled' && !/^(pending|expired)/.test(o.paymentStatus || '') && dayKey(o.createdAt) >= from && dayKey(o.createdAt) <= to)
  const books = new Map((await ctx.store.find('books', {})).map((b) => [String(b._id), b]))
  const rets = (await ctx.store.find('returns', {})).filter((r) => dayKey(r.createdAt) >= from && dayKey(r.createdAt) <= to)
  const users = await ctx.store.find('users', {})
  const byFormat = {}
  const byGenre = {}
  const byAuthor = {}
  const byBook = {}
  const byCountry = {}
  const coupons = {}
  let unitsTotal = 0
  let giftCardSales = 0
  for (const o of orders) {
    const net = Math.max(1, (o.items.filter((i) => i.kind !== 'giftcard').reduce((s, i) => s + i.price * i.qty, 0)))
    const k = (o.discount || 0) + (o.bundleDiscount || 0) + (o.pointsDiscount || 0)
    for (const i of o.items) {
      if (i.kind === 'giftcard') {
        giftCardSales += i.price
        continue
      }
      const rev = i.price * i.qty * (1 - k / net)
      const b = books.get(String(i.book))
      const f = (byFormat[i.format || 'paperback'] ||= { units: 0, revenue: 0 })
      f.units += i.qty
      f.revenue += rev
      const g = (byGenre[b?.genre || 'Other'] ||= { units: 0, revenue: 0 })
      g.units += i.qty
      g.revenue += rev
      const a = (byAuthor[b?.author || 'Unknown'] ||= { units: 0, revenue: 0 })
      a.units += i.qty
      a.revenue += rev
      const t = (byBook[String(i.book)] ||= { id: String(i.book), title: i.title, units: 0, revenue: 0 })
      t.units += i.qty
      t.revenue += rev
      unitsTotal += i.qty
    }
    const c = (byCountry[o.shipping?.country || 'US'] ||= { orders: 0, revenue: 0 })
    c.orders++
    c.revenue += orderRevenue(o)
    if (o.couponCode) {
      const cc = (coupons[o.couponCode] ||= { uses: 0, discount: 0 })
      cc.uses++
      cc.discount += o.discount || 0
    }
  }
  const rows = (obj) => Object.entries(obj).map(([name, v]) => ({ name, units: v.units, orders: v.orders, uses: v.uses, revenue: round2(v.revenue), discount: v.discount === undefined ? undefined : round2(v.discount) })).sort((a, b) => (b.revenue || b.uses || 0) - (a.revenue || a.uses || 0))
  const revenue = round2(orders.reduce((s, o) => s + orderRevenue(o), 0))
  const days = []
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) {
    const os = orders.filter((o) => dayKey(o.createdAt) === d)
    days.push({ date: d, revenue: round2(os.reduce((s, o) => s + orderRevenue(o), 0)), orders: os.length })
  }
  const refunded = round2(orders.reduce((s, o) => s + (o.refundedTotal || 0), 0))
  return {
    from,
    to,
    kpis: {
      revenue,
      orders: orders.length,
      avgOrderValue: orders.length ? round2(revenue / orders.length) : 0,
      units: unitsTotal,
      newCustomers: users.filter((u) => u.role === 'user' && dayKey(u.createdAt) >= from && dayKey(u.createdAt) <= to).length,
      returns: rets.length,
      returnRate: orders.length ? Math.round((rets.length / orders.length) * 1000) / 10 : 0,
      refunded,
      giftCardSales: round2(giftCardSales),
      pointsIssued: orders.reduce((s, o) => s + (o.pointsEarned || 0), 0),
      pointsRedeemed: orders.reduce((s, o) => s + (o.pointsUsed || 0), 0),
      loyaltyLiability: round2(users.reduce((s, u) => s + (u.points || 0), 0) * settings.loyalty.pointValue),
    },
    byDay: days,
    byFormat: rows(byFormat),
    byGenre: rows(byGenre),
    topAuthors: rows(byAuthor).slice(0, 10),
    topBooks: Object.values(byBook).sort((a, b) => b.units - a.units).slice(0, 10).map((t) => ({ ...t, revenue: round2(t.revenue) })),
    byCountry: rows(byCountry),
    coupons: rows(coupons),
  }
}
const dateParam = (v, def) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : def)
route('GET', '/api/admin/reports', 'admin', async ({ ctx, query }) => {
  const to = dateParam(query.to, dayKey(ctx.now()))
  const from = dateParam(query.from, addDays(to, -89))
  if (from > to) fail(400, 'The start date must not be after the end date')
  return reportData(ctx, from, to)
})

// ---------- CSV exports ----------
const csv = (filename, columns, rows) => [200, { __csv: true, filename, text: toCsv(columns, rows) }]
route('GET', '/api/export/:name', 'staff', async ({ ctx, params, query, user }) => {
  const name = params.name.replace(/\.csv$/, '')
  const stamp = dayKey(ctx.now())
  const users = new Map((await ctx.store.find('users', {})).map((u) => [String(u._id), u]))
  if (name === 'orders') {
    const from = dateParam(query.from, '0000-01-01')
    const to = dateParam(query.to, '9999-12-31')
    const rows = (await ctx.store.find('orders', {}, { sort: { createdAt: -1 } })).filter((o) => dayKey(o.createdAt) >= from && dayKey(o.createdAt) <= to)
    return csv(`orders-${stamp}.csv`, [
      { label: 'Order', value: (o) => shortId(o._id) }, { label: 'Placed', value: 'createdAt' }, { label: 'Customer', value: (o) => users.get(String(o.user))?.name }, { label: 'Email', value: (o) => users.get(String(o.user))?.email },
      { label: 'Status', value: 'status' }, { label: 'Payment', value: 'paymentStatus' }, { label: 'Items', value: (o) => o.items.map((i) => `${i.title} [${i.format || 'gift card'}] x${i.qty}`).join('; ') },
      { label: 'Subtotal', value: 'subtotal' }, { label: 'Discounts', value: (o) => round2((o.discount || 0) + (o.bundleDiscount || 0) + (o.pointsDiscount || 0)) }, { label: 'Shipping', value: 'shippingCost' }, { label: 'Tax', value: 'tax' },
      { label: 'Total', value: 'total' }, { label: 'Refunded', value: (o) => o.refundedTotal || 0 }, { label: 'Country', value: (o) => o.shipping?.country }, { label: 'Coupon', value: 'couponCode' },
    ], rows)
  }
  if (name === 'inventory') {
    const rows = []
    for (const b of await getBooks(ctx)) for (const f of b.formats) rows.push({ b, f })
    return csv(`inventory-${stamp}.csv`, [
      { label: 'Title', value: (r) => r.b.title }, { label: 'Author', value: (r) => r.b.author }, { label: 'Genre', value: (r) => r.b.genre }, { label: 'Format', value: (r) => r.f.type }, { label: 'ISBN', value: (r) => r.f.isbn || r.b.isbn },
      { label: 'Price', value: (r) => r.f.price }, { label: 'Stock', value: (r) => (isPhysical(r.f.type) ? r.f.stock : 'digital') }, { label: 'Units sold (title)', value: (r) => r.b.sold }, { label: 'Release', value: (r) => String(r.b.publishedAt || '').slice(0, 10) },
    ], rows)
  }
  if (name === 'returns') {
    const rows = await ctx.store.find('returns', {}, { sort: { createdAt: -1 } })
    return csv(`returns-${stamp}.csv`, [
      { label: 'Return', value: (r) => shortId(r._id) }, { label: 'Order', value: (r) => shortId(r.order) }, { label: 'Customer', value: (r) => users.get(String(r.user))?.name }, { label: 'Status', value: 'status' }, { label: 'Reason', value: 'reason' },
      { label: 'Items', value: (r) => r.items.map((i) => `${i.title} x${i.qty}`).join('; ') }, { label: 'Amount', value: 'amount' }, { label: 'Requested', value: 'createdAt' },
    ], rows)
  }
  if (user.role !== 'admin') fail(403, 'Admin access required')
  if (name === 'users') {
    const settings = await getSettings(ctx)
    return csv(`customers-${stamp}.csv`, [
      { label: 'Name', value: 'name' }, { label: 'Email', value: 'email' }, { label: 'Role', value: 'role' }, { label: 'Country', value: 'country' }, { label: 'Tier', value: (u) => tierFor(u.lifetimePoints || 0, settings).id }, { label: 'Points', value: (u) => u.points || 0 }, { label: 'Joined', value: 'createdAt' }, { label: 'Disabled', value: (u) => (u.disabled ? 'yes' : 'no') },
    ], await ctx.store.find('users', {}, { sort: { createdAt: -1 } }))
  }
  if (name === 'sales') {
    const from = dateParam(query.from, '0000-01-01')
    const to = dateParam(query.to, '9999-12-31')
    const rows = []
    for (const o of await ctx.store.find('orders', {}, { sort: { createdAt: -1 } })) {
      if (o.status === 'cancelled' || dayKey(o.createdAt) < from || dayKey(o.createdAt) > to) continue
      for (const i of o.items) rows.push({ o, i })
    }
    return csv(`sales-${stamp}.csv`, [
      { label: 'Date', value: (r) => dayKey(r.o.createdAt) }, { label: 'Order', value: (r) => shortId(r.o._id) }, { label: 'Title', value: (r) => r.i.title }, { label: 'Format', value: (r) => r.i.format || 'gift card' }, { label: 'Qty', value: (r) => r.i.qty }, { label: 'Unit price', value: (r) => r.i.price }, { label: 'Line total', value: (r) => round2(r.i.price * r.i.qty) },
    ], rows)
  }
  fail(404, 'Unknown export')
})

