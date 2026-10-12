// Catalogue routes: books, search, reviews, Q&A, stock alerts, e-book text and book management.
import { route, HttpError, fail, str, text, int, num, notify, paginate } from './framework.mjs'
import { 
  FORMATS, isPhysical, deriveBook, bookFormats, findFormat, defaultFormat, isUpcoming, anyBuyable, slugify, round1, round2, toIsbn13, isStaff, ROLES,
 } from './rules.mjs'
import { searchBooks, suggest, didYouMean, recommendFor } from './search.mjs'
import { chaptersFor, sampleChapters, wordCount, readingMinutes } from './reading.mjs'

export const nowOf = (ctx) => new Date(ctx.now())

export function bookOut(b, now) {
  return { ...b, upcoming: isUpcoming(b, now) }
}
export async function getBooks(ctx) {
  const rows = await ctx.store.find('books', {})
  return rows.map((b) => deriveBook({ slug: slugify(b.title), ...b }))
}
export async function getBook(ctx, id) {
  const b = await ctx.store.get('books', id)
  if (!b) throw new HttpError(404, 'Book not found')
  return deriveBook({ slug: slugify(b.title), ...b })
}
const isId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{2,40}$/.test(s)
const badId = () => new HttpError(400, 'Invalid book id')
async function bookOr404(ctx, id) {
  if (!isId(id)) throw badId()
  return getBook(ctx, id)
}

const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  'price-asc': (a, b) => a.price - b.price || a.title.localeCompare(b.title),
  'price-desc': (a, b) => b.price - a.price || a.title.localeCompare(b.title),
  rating: (a, b) => b.rating - a.rating || b.numReviews - a.numReviews || a.title.localeCompare(b.title),
  bestselling: (a, b) => b.sold - a.sold || a.title.localeCompare(b.title),
}
const newest = (now) => (a, b) => isUpcoming(a, now) - isUpcoming(b, now) || String(b.publishedAt).localeCompare(String(a.publishedAt)) || a.title.localeCompare(b.title)
const numOrNaN = (v) => (v === undefined || v === '' ? NaN : Number(v))

// ---------- list / search ----------
route('GET', '/api/books', null, async ({ ctx, query: q }) => {
  const now = nowOf(ctx)
  let books = await getBooks(ctx)
  const all = books
  const search = str(q.search)
  let ranked = false
  if (search) {
    books = searchBooks(books, search).map((s) => s.book)
    ranked = true
  }
  const eq = (k, v) => (books = books.filter((b) => b[k] === v))
  if (str(q.genre)) eq('genre', str(q.genre))
  if (str(q.language)) eq('language', str(q.language))
  if (str(q.author)) eq('author', str(q.author))
  if (str(q.series)) books = books.filter((b) => b.series && (b.series.slug === str(q.series) || b.series.name === str(q.series)))
  if (str(q.format)) books = books.filter((b) => b.formats.some((f) => f.type === str(q.format)))
  if (str(q.tag)) books = books.filter((b) => (b.tags || []).includes(str(q.tag)))
  const min = numOrNaN(q.minPrice)
  const max = numOrNaN(q.maxPrice)
  if (Number.isFinite(min)) books = books.filter((b) => b.price >= min)
  if (Number.isFinite(max)) books = books.filter((b) => b.price <= max)
  const minRating = numOrNaN(q.minRating)
  if (Number.isFinite(minRating) && minRating > 0) books = books.filter((b) => b.rating >= minRating)
  if (q.inStock === '1' || q.inStock === 'true') books = books.filter((b) => anyBuyable(b, now))
  if (q.preorder === '1' || q.preorder === 'true') books = books.filter((b) => isUpcoming(b, now))
  if (q.sort === 'newest') books = books.slice().sort(newest(now))
  else if (SORTS[q.sort]) books = books.slice().sort(SORTS[q.sort])
  else if (!ranked) books = books.slice().sort(SORTS.title)
  const p = paginate(books, q, 8, 50)
  const prices = all.map((b) => b.price)
  const facet = (k) => [...new Set(all.map((b) => b[k]).filter(Boolean))].sort()
  return {
    books: p.slice.map((b) => bookOut(b, now)),
    page: p.page,
    limit: p.limit,
    total: p.total,
    pages: p.pages,
    genres: facet('genre'),
    languages: facet('language'),
    formats: FORMATS.filter((f) => all.some((b) => b.formats.some((x) => x.type === f))),
    priceRange: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
    didYouMean: search && p.total < 3 ? didYouMean(all, search) : null,
  }
})

route('GET', '/api/books/suggest', null, async ({ ctx, query }) => {
  const now = nowOf(ctx)
  const s = suggest(await getBooks(ctx), str(query.q).slice(0, 80), 6)
  return { ...s, books: s.books.map((b) => ({ _id: b._id, title: b.title, author: b.author, genre: b.genre, image: b.image, price: b.price, upcoming: isUpcoming(b, now) })) }
})

route('GET', '/api/books/by-ids', null, async ({ ctx, query }) => {
  const ids = str(query.ids).split(',').filter(isId).slice(0, 24)
  const now = nowOf(ctx)
  const books = await getBooks(ctx)
  return { books: ids.map((id) => books.find((b) => String(b._id) === id)).filter(Boolean).map((b) => bookOut(b, now)) }
})

route('GET', '/api/books/featured', null, async ({ ctx }) => {
  const now = nowOf(ctx)
  const books = await getBooks(ctx)
  const released = books.filter((b) => !isUpcoming(b, now))
  const genres = new Map()
  for (const b of books) if (b.genre) genres.set(b.genre, (genres.get(b.genre) || 0) + 1)
  const events = (await ctx.store.find('events', { startsAt: { $gte: ctx.now() } }, { sort: { startsAt: 1 }, limit: 3 })).map((e) => ({ ...e, going: (e.rsvps || []).length }))
  const clubs = await ctx.store.find('clubs', {}, { limit: 40 })
  return {
    bestsellers: released.filter((b) => anyBuyable(b, now)).sort(SORTS.bestselling).slice(0, 8).map((b) => bookOut(b, now)),
    newArrivals: released.slice().sort(newest(now)).slice(0, 8).map((b) => bookOut(b, now)),
    comingSoon: books.filter((b) => isUpcoming(b, now)).sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt))).slice(0, 6).map((b) => bookOut(b, now)),
    genres: [...genres].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    total: books.length,
    collections: (await ctx.store.find('collections', {})).filter((c) => c.featured).slice(0, 4),
    bundles: (await ctx.store.find('bundles', {})).slice(0, 3),
    events,
    clubs: clubs.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0)).slice(0, 3).map((c) => ({ _id: c._id, name: c.name, description: c.description, members: c.members?.length || 0, pick: c.pick || null })),
    ebookCount: books.filter((b) => b.formats.some((f) => f.type === 'ebook')).length,
  }
})

// ---------- detail ----------
route('GET', '/api/books/:id', null, async ({ ctx, params }) => bookOut(await bookOr404(ctx, params.id), nowOf(ctx)))

// Everything the detail page needs besides the book itself: owned formats, series, boxed sets, collections.
route('GET', '/api/books/:id/extras', null, async ({ ctx, params, user }) => {
  const book = await bookOr404(ctx, params.id)
  const now = nowOf(ctx)
  const books = await getBooks(ctx)
  const series = book.series?.name ? books.filter((b) => b.series?.name === book.series.name).sort((a, b) => (a.series.number || 0) - (b.series.number || 0)).map((b) => bookOut(b, now)) : []
  const bundles = (await ctx.store.find('bundles', {})).filter((b) => b.bookIds.includes(String(book._id)))
  const collections = (await ctx.store.find('collections', {})).filter((c) => c.bookIds.includes(String(book._id)))
  let owned = []
  let alerts = []
  if (user) {
    owned = await ownedFormats(ctx, user._id, book._id)
    alerts = (await ctx.store.find('stockAlerts', { user: String(user._id), book: String(book._id) })).map((a) => a.format)
  }
  return { series, seriesInfo: book.series?.slug ? await ctx.store.one('series', { slug: book.series.slug }) : null, bundles, collections, owned, alerts }
})

export async function ownedFormats(ctx, userId, bookId) {
  const orders = await ctx.store.find('orders', { user: String(userId), 'items.book': String(bookId), status: { $ne: 'cancelled' } })
  const out = new Set()
  for (const o of orders) {
    if (/^(pending|expired)/.test(o.paymentStatus || '')) continue
    for (const it of o.items) if (String(it.book) === String(bookId) && !it.refunded) out.add(it.format || 'paperback')
  }
  return [...out]
}

route('GET', '/api/books/:id/related', null, async ({ ctx, params }) => {
  const book = await bookOr404(ctx, params.id)
  const now = nowOf(ctx)
  const orders = await ctx.store.find('orders', { 'items.book': String(book._id), status: { $ne: 'cancelled' } })
  const together = new Map([[String(book._id), new Map()]])
  for (const o of orders) for (const it of o.items) if (String(it.book) !== String(book._id)) together.get(String(book._id)).set(String(it.book), (together.get(String(book._id)).get(String(it.book)) || 0) + 1)
  const books = recommendFor(await getBooks(ctx), book, { exclude: new Set(), together }, 6)
  return { books: books.map((b) => bookOut(b, now)) }
})

// ---------- e-book text ----------
export async function loadTextFor(ctx, book) {
  const classics = await ctx.loadClassics?.()
  return chaptersFor({ ...book, slug: book.slug || slugify(book.title) }, classics)
}
route('GET', '/api/books/:id/text', null, async ({ ctx, params, query, user }) => {
  const book = await bookOr404(ctx, params.id)
  const now = nowOf(ctx)
  if (isUpcoming(book, now)) throw new HttpError(403, 'This book has not been released yet')
  const format = query.format === 'audiobook' ? 'audiobook' : 'ebook'
  if (!findFormat(book, format)) throw new HttpError(404, `No ${format === 'ebook' ? 'e-book' : 'audiobook'} edition of this title`)
  const all = await loadTextFor(ctx, book)
  let full = false
  if (user) full = isStaff(user) || (await ownedFormats(ctx, user._id, book._id)).includes(format)
  const chapters = full ? all : sampleChapters(all)
  return {
    book: { _id: book._id, title: book.title, author: book.author, genre: book.genre, pages: book.pages, image: book.image, slug: book.slug, formats: book.formats },
    format,
    full,
    totalChapters: all.length,
    chapters,
    words: wordCount(chapters),
    minutes: readingMinutes(wordCount(chapters)),
    source: (await ctx.loadClassics?.())?.[book.slug]?.gutenberg ? 'Project Gutenberg (public domain)' : 'Folio Books sample text',
  }
})

// ---------- reviews ----------
export async function refreshRating(ctx, bookId) {
  const rs = (await ctx.store.find('reviews', { book: String(bookId) })).filter((r) => !r.hidden)
  await ctx.store.update('books', bookId, { numReviews: rs.length, rating: rs.length ? round1(rs.reduce((s, r) => s + r.rating, 0) / rs.length) : 0 })
}
async function verifiedBuyers(ctx, bookId) {
  const orders = await ctx.store.find('orders', { 'items.book': String(bookId), status: { $nin: ['cancelled'] } })
  return new Set(orders.map((o) => String(o.user)))
}
const reviewOut = (r, user, buyers) => ({
  _id: r._id,
  user: r.user || null,
  name: r.name,
  rating: r.rating,
  text: r.text || '',
  spoiler: !!r.spoiler,
  helpful: (r.helpful || []).length,
  voted: !!user && (r.helpful || []).includes(String(user._id)),
  mine: !!user && String(r.user) === String(user._id),
  verified: !!r.user && buyers.has(String(r.user)),
  hidden: !!r.hidden,
  createdAt: r.createdAt,
})

route('GET', '/api/books/:id/reviews', null, async ({ ctx, params, query, user }) => {
  const book = await bookOr404(ctx, params.id)
  const rows = (await ctx.store.find('reviews', { book: String(book._id) })).filter((r) => !r.hidden || (user && (isStaff(user) || String(r.user) === String(user._id))))
  const buyers = await verifiedBuyers(ctx, book._id)
  let reviews = rows.map((r) => reviewOut(r, user, buyers))
  reviews = query.sort === 'helpful' ? reviews.sort((a, b) => b.helpful - a.helpful || b.createdAt.localeCompare(a.createdAt)) : reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { reviews: reviews.slice(0, 100), rating: book.rating, numReviews: book.numReviews }
})

route('POST', '/api/books/:id/reviews', 'user', async ({ ctx, params, body, user }) => {
  const book = await bookOr404(ctx, params.id)
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'rating must be an integer from 1 to 5')
  const t = body.text === undefined ? '' : typeof body.text === 'string' ? body.text.trim() : fail(400, 'text must be a string')
  if (t.length > 1000) fail(400, 'text must be at most 1000 characters')
  const fields = { rating, text: t, name: user.name, spoiler: !!body.spoiler }
  const existing = await ctx.store.one('reviews', { book: String(book._id), user: String(user._id) })
  let review
  if (existing) review = await ctx.store.update('reviews', existing._id, { ...fields, hidden: existing.hidden && false, editedAt: ctx.now() })
  else review = await ctx.store.insert('reviews', { book: String(book._id), user: String(user._id), ...fields, helpful: [], reports: 0, createdAt: ctx.now() })
  await refreshRating(ctx, book._id)
  return [201, review]
})

route('DELETE', '/api/books/:id/reviews/mine', 'user', async ({ ctx, params, user }) => {
  if (!isId(params.id)) throw badId()
  const r = await ctx.store.one('reviews', { book: params.id, user: String(user._id) })
  if (!r) fail(404, 'You have not reviewed this book')
  await ctx.store.remove('reviews', r._id)
  await refreshRating(ctx, params.id)
  return { deleted: true }
})

route('POST', '/api/reviews/:rid/helpful', 'user', async ({ ctx, params, user }) => {
  const r = await ctx.store.get('reviews', params.rid)
  if (!r || r.hidden) fail(404, 'Review not found')
  if (String(r.user) === String(user._id)) fail(400, 'You cannot vote on your own review')
  const has = (r.helpful || []).includes(String(user._id))
  await ctx.store.atomic('reviews', { _id: r._id }, has ? { $pull: { helpful: String(user._id) } } : { $addToSet: { helpful: String(user._id) } })
  return { voted: !has, helpful: (r.helpful || []).length + (has ? -1 : 1) }
})

route('POST', '/api/reviews/:rid/report', 'user', async ({ ctx, params, body, user }) => {
  const r = await ctx.store.get('reviews', params.rid)
  if (!r) fail(404, 'Review not found')
  const reason = text(body, 'reason', { max: 200 }) || 'Reported by a reader'
  if ((r.reporters || []).includes(String(user._id))) return { reported: true }
  await ctx.store.atomic('reviews', { _id: r._id }, { $inc: { reports: 1 }, $addToSet: { reporters: String(user._id) }, $set: { lastReport: reason } })
  return { reported: true }
})

// ---------- Q&A ----------
const answerOut = (a) => ({ _id: a._id, name: a.name, role: a.role, text: a.text, createdAt: a.createdAt })
route('GET', '/api/books/:id/questions', null, async ({ ctx, params }) => {
  const book = await bookOr404(ctx, params.id)
  const qs = (await ctx.store.find('questions', { book: String(book._id) }, { sort: { createdAt: -1 } })).filter((q) => !q.hidden)
  return { questions: qs.map((q) => ({ _id: q._id, name: q.name, text: q.text, createdAt: q.createdAt, answers: (q.answers || []).map(answerOut) })) }
})
route('POST', '/api/books/:id/questions', 'user', async ({ ctx, params, body, user }) => {
  const book = await bookOr404(ctx, params.id)
  const t = text(body, 'text', { max: 400, min: 8, required: true, label: 'Question' })
  const q = await ctx.store.insert('questions', { book: String(book._id), user: String(user._id), name: user.name, text: t, answers: [], createdAt: ctx.now() })
  return [201, { _id: q._id, name: q.name, text: q.text, createdAt: q.createdAt, answers: [] }]
})
route('POST', '/api/questions/:qid/answers', 'user', async ({ ctx, params, body, user }) => {
  const q = await ctx.store.get('questions', params.qid)
  if (!q || q.hidden) fail(404, 'Question not found')
  const t = text(body, 'text', { max: 800, min: 2, required: true, label: 'Answer' })
  const a = { _id: ctx.newId(), user: String(user._id), name: user.name, role: user.role, text: t, createdAt: ctx.now() }
  await ctx.store.atomic('questions', { _id: q._id }, { $push: { answers: a } })
  if (String(q.user) !== String(user._id)) await notify(ctx, q.user, { type: 'answer', title: 'Your question was answered', body: t.slice(0, 120), link: `/books/${q.book}#qa` })
  return [201, answerOut(a)]
})
route('DELETE', '/api/questions/:qid', 'user', async ({ ctx, params, user }) => {
  const q = await ctx.store.get('questions', params.qid)
  if (!q) fail(404, 'Question not found')
  if (!isStaff(user) && String(q.user) !== String(user._id)) fail(403, 'You can only remove your own questions')
  await ctx.store.remove('questions', q._id)
  return { deleted: true }
})

// ---------- back-in-stock alerts ----------
route('POST', '/api/books/:id/notify', 'user', async ({ ctx, params, body, user }) => {
  const book = await bookOr404(ctx, params.id)
  const format = FORMATS.includes(body.format) ? body.format : defaultFormat(book).type
  if (!isPhysical(format) || !findFormat(book, format)) fail(400, 'Alerts are only for physical editions')
  const key = { user: String(user._id), book: String(book._id), format }
  const have = await ctx.store.one('stockAlerts', key)
  if (have) {
    await ctx.store.remove('stockAlerts', have._id)
    return { subscribed: false }
  }
  if (findFormat(book, format).stock > 0 && !isUpcoming(book, nowOf(ctx))) fail(400, 'This edition is in stock already')
  await ctx.store.insert('stockAlerts', { ...key, createdAt: ctx.now() })
  return { subscribed: true }
})
route('GET', '/api/me/alerts', 'user', async ({ ctx, user }) => {
  const rows = await ctx.store.find('stockAlerts', { user: String(user._id) })
  const out = []
  for (const a of rows) {
    const b = await ctx.store.get('books', a.book)
    if (b) out.push({ _id: a._id, format: a.format, book: { _id: b._id, title: b.title, author: b.author } })
  }
  return out
})

async function fireStockAlerts(ctx, before, after) {
  for (const f of after.formats.filter((x) => isPhysical(x.type))) {
    const was = before ? findFormat(before, f.type)?.stock || 0 : 0
    if (was <= 0 && f.stock > 0) {
      const subs = await ctx.store.find('stockAlerts', { book: String(after._id), format: f.type })
      for (const s of subs) await ctx.store.remove('stockAlerts', s._id)
      await notify(ctx, subs.map((s) => s.user), { type: 'stock', title: `Back in stock: ${after.title}`, body: `The ${f.type} edition is available again.`, link: `/books/${after._id}` })
    }
  }
}

// ---------- book management (staff) ----------
function parseFormats(raw, partial) {
  let list = raw
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      throw new HttpError(400, 'formats must be valid JSON')
    }
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > 4) throw new HttpError(400, 'formats must list 1 to 4 editions')
  const seen = new Set()
  return list.map((f) => {
    if (!f || !FORMATS.includes(f.type)) throw new HttpError(400, `format type must be one of: ${FORMATS.join(', ')}`)
    if (seen.has(f.type)) throw new HttpError(400, `Duplicate format: ${f.type}`)
    seen.add(f.type)
    const price = num(f.price, { min: 0, max: 100000, label: `${f.type} price` })
    const out = { type: f.type, price: round2(price) }
    if (isPhysical(f.type)) out.stock = int(f.stock, { min: 0, max: 1000000, label: `${f.type} stock`, def: partial ? 0 : 50 })
    if (f.isbn) {
      const i = toIsbn13(f.isbn)
      if (!i) throw new HttpError(400, `${f.type} ISBN is not valid`)
      out.isbn = i
    }
    if (f.edition) out.edition = String(f.edition).trim().slice(0, 60)
    if (f.type === 'audiobook' && f.minutes) out.minutes = int(f.minutes, { min: 1, max: 20000, label: 'audiobook minutes' })
    if (f.type === 'audiobook' && f.narrator) out.narrator = String(f.narrator).trim().slice(0, 80)
    return out
  })
}

export function validateBook(body, partial, current) {
  const data = {}
  const t = (key, max, required) => {
    const v = text(body, key, { max, required: required && !partial })
    if (v === undefined) return
    if (required && !v) throw new HttpError(400, `${key} is required`)
    data[key] = v
  }
  t('title', 200, true)
  t('author', 120, true)
  t('genre', 60)
  t('language', 40)
  t('description', 2000)
  t('excerpt', 4000)
  t('publisher', 120)
  if (body.formats !== undefined && body.formats !== '') data.formats = parseFormats(body.formats, partial)
  else {
    if (body.price === undefined || body.price === '') {
      if (!partial) throw new HttpError(400, 'price is required')
    } else {
      const price = typeof body.price === 'number' ? body.price : Number(body.price)
      if (!Number.isFinite(price) || price < 0 || price > 100000) throw new HttpError(400, 'price must be a number between 0 and 100000')
      data.__price = round2(price)
    }
    if (body.stock !== undefined && body.stock !== '') data.__stock = int(body.stock, { min: 0, max: 1000000, label: 'stock' })
  }
  if (body.pages !== undefined && body.pages !== '') data.pages = int(body.pages, { min: 1, max: 20000, label: 'pages' })
  if (body.isbn !== undefined && body.isbn !== '') {
    const i = toIsbn13(body.isbn)
    if (!i) throw new HttpError(400, 'isbn is not a valid ISBN-10 or ISBN-13')
    data.isbn = i
  }
  if (body.publishedAt !== undefined && body.publishedAt !== '') {
    const d = new Date(body.publishedAt)
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'publishedAt must be a valid date')
    data.publishedAt = d.toISOString()
  }
  const sname = body.seriesName !== undefined ? str(body.seriesName) : body.series?.name !== undefined ? str(body.series.name) : undefined
  if (sname !== undefined) {
    if (sname.length > 80) throw new HttpError(400, 'series name must be at most 80 characters')
    const sn = body.seriesNumber !== undefined ? body.seriesNumber : body.series?.number
    data.series = sname ? { name: sname, slug: slugify(sname), number: sn === '' || sn === undefined ? 1 : int(sn, { min: 1, max: 99, label: 'series number' }) } : null
  }
  if (body.tags !== undefined) {
    const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags).split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean)
    if (tags.length > 10 || tags.some((x) => x.length > 30)) throw new HttpError(400, 'Use up to 10 tags of at most 30 characters')
    data.tags = [...new Set(tags)]
  }
  const url = body.image === undefined ? undefined : typeof body.image === 'string' ? body.image.trim() : null
  if (url === null) throw new HttpError(400, 'image must be a string')
  if (url) {
    if (!url.startsWith('data:image/')) {
      let ok = false
      try {
        ok = ['http:', 'https:'].includes(new URL(url).protocol) && url.length <= 1000
      } catch {
        /* invalid */
      }
      if (!ok) throw new HttpError(400, 'image must be a valid http(s) URL (or upload a cover file)')
    }
    data.image = url
  }
  // flat price/stock apply to the paperback (or first physical) edition
  if (data.__price !== undefined || data.__stock !== undefined) {
    const base = current ? bookFormats(current).map((f) => ({ ...f })) : [{ type: 'paperback', price: 0, stock: 50 }]
    let target = base.find((f) => f.type === 'paperback') || base.find((f) => isPhysical(f.type)) || base[0]
    if (data.__price !== undefined) target.price = data.__price
    if (data.__stock !== undefined && isPhysical(target.type)) target.stock = data.__stock
    data.formats = base
  }
  delete data.__price
  delete data.__stock
  return data
}

async function assertIsbnFree(ctx, data, selfId) {
  const isbns = [data.isbn, ...(data.formats || []).map((f) => f.isbn)].filter(Boolean)
  if (!isbns.length) return
  const books = await ctx.store.find('books', {})
  for (const b of books) {
    if (selfId && String(b._id) === String(selfId)) continue
    const have = [b.isbn, ...(b.formats || []).map((f) => f.isbn)].filter(Boolean)
    if (isbns.some((i) => have.includes(i))) throw new HttpError(409, 'A book with this ISBN already exists')
  }
}

async function uniqueSlug(ctx, title, selfId) {
  const base = slugify(title) || 'book'
  const all = (await ctx.store.find('books', {})).filter((b) => String(b._id) !== String(selfId))
  const taken = new Set(all.map((b) => b.slug || slugify(b.title)))
  let s = base
  for (let i = 2; taken.has(s); i++) s = `${base}-${i}`
  return s
}

export async function createBook(ctx, data) {
  const now = ctx.now()
  const full = deriveBook({ genre: '', language: 'English', description: '', excerpt: '', image: '', pages: 0, tags: [], series: null, sold: 0, rating: 0, numReviews: 0, publishedAt: now, createdAt: now, ...data })
  full.slug = await uniqueSlug(ctx, full.title)
  const book = await ctx.store.insert('books', full)
  // followers of the author hear about it
  const follows = await ctx.store.find('follows', { author: slugify(book.author) })
  const upcoming = isUpcoming(book, new Date(now))
  await notify(ctx, follows.map((f) => f.user), { type: 'new-book', title: `${upcoming ? 'Coming soon' : 'New'} from ${book.author}`, body: book.title, link: `/books/${book._id}` })
  return book
}

route('POST', '/api/books', 'staff', async ({ ctx, body, req }) => {
  try {
    const src = { ...body, image: body.image === undefined && body.__cover ? undefined : body.image }
    const data = validateBook(src, false)
    if (body.__cover) data.image = body.__cover
    await assertIsbnFree(ctx, data)
    return [201, bookOut(await createBook(ctx, data), nowOf(ctx))]
  } catch (e) {
    req?.cleanup?.()
    throw e
  }
})

route('PUT', '/api/books/:id', 'staff', async ({ ctx, params, body, req }) => {
  try {
    if (!isId(params.id)) throw badId()
    const before = await getBook(ctx, params.id)
    const data = validateBook(body, true, before)
    if (body.__cover) data.image = body.__cover
    await assertIsbnFree(ctx, data, params.id)
    const merged = deriveBook({ ...before, ...data })
    const patch = { ...data, ...pickDerived(merged) }
    const after = await ctx.store.update('books', params.id, patch)
    if (data.image && data.image !== before.image) ctx.removeUpload?.(before.image)
    await fireStockAlerts(ctx, before, deriveBook(after))
    return bookOut(deriveBook(after), nowOf(ctx))
  } catch (e) {
    req?.cleanup?.()
    throw e
  }
})
const pickDerived = (b) => ({ formats: b.formats, price: b.price, stock: b.stock, minPrice: b.minPrice, maxPrice: b.maxPrice, hasDigital: b.hasDigital })

route('DELETE', '/api/books/:id', 'admin', async ({ ctx, params }) => {
  if (!isId(params.id)) throw badId()
  const book = await ctx.store.get('books', params.id)
  if (!book) fail(404, 'Book not found')
  await ctx.store.remove('books', book._id)
  ctx.removeUpload?.(book.image)
  await ctx.store.removeWhere('reviews', { book: String(book._id) })
  await ctx.store.removeWhere('questions', { book: String(book._id) })
  await ctx.store.removeWhere('stockAlerts', { book: String(book._id) })
  return { deleted: true, id: book._id }
})

// Stock adjustment with an audit trail: { format, delta } or { format, set }.
route('PATCH', '/api/books/:id/stock', 'staff', async ({ ctx, params, body, user }) => {
  const before = await bookOr404(ctx, params.id)
  const format = FORMATS.includes(body.format) ? body.format : defaultFormat(before).type
  const f = findFormat(before, format)
  if (!f || !isPhysical(format)) fail(400, 'Stock is only tracked for paperback and hardcover editions')
  let next
  if (body.set !== undefined) next = int(body.set, { min: 0, max: 1000000, label: 'stock' })
  else next = f.stock + int(body.delta, { min: -1000000, max: 1000000, label: 'delta' })
  if (next < 0) fail(400, 'Stock cannot go below zero')
  const formats = bookFormats(before).map((x) => (x.type === format ? { ...x, stock: next } : x))
  const merged = deriveBook({ ...before, formats })
  const after = await ctx.store.update('books', before._id, pickDerived(merged))
  await ctx.store.insert('stockMoves', { book: String(before._id), format, from: f.stock, to: next, by: String(user._id), reason: text(body, 'reason', { max: 120 }) || '', createdAt: ctx.now() })
  await fireStockAlerts(ctx, before, merged)
  return bookOut(deriveBook(after), nowOf(ctx))
})
