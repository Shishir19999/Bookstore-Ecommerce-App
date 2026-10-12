// Account and reader routes: auth, reading list, goals and stats, reader state, library, recommendations, notifications.
import { route, HttpError, fail, str, int, num, notify, getSettings, publicUser } from './framework.mjs'
import { READING_STATUSES, isDigital, isUpcoming, addDays, slugify } from './rules.mjs'
import { recommendations } from './search.mjs'
import { readingStats } from './reading.mjs'
import { getBooks, nowOf, bookOut } from './m-catalog.mjs'
import { settlePreorders } from './m-shop.mjs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{2,40}$/.test(s)
const today = (ctx) => ctx.now().slice(0, 10)

// ---------- auth ----------
route('POST', '/api/auth/register', null, async ({ ctx, body }) => {
  const name = str(body.name)
  const email = str(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!name || name.length > 80) fail(400, 'Name is required (max 80 chars)')
  if (!EMAIL_RE.test(email)) fail(400, 'A valid email is required')
  if (password.length < 6 || password.length > 72) fail(400, 'Password must be 6-72 characters')
  if (await ctx.store.one('users', { email })) fail(409, 'Email already registered')
  // role is never taken from the request: self-registration always yields a customer.
  const user = await ctx.store.insert('users', { name, email, password: await ctx.hash(password), role: 'user', tokenVersion: 0, points: 0, lifetimePoints: 0, country: 'US', readingList: [], goal: null, createdAt: ctx.now() })
  await notify(ctx, user._id, { type: 'welcome', title: 'Welcome to Folio Books', body: 'Set a reading goal, follow your favourite authors and join a book club.', link: '/reading' })
  return [201, { token: await ctx.signToken(user), user: publicUser(user, await getSettings(ctx)) }]
})

route('POST', '/api/auth/login', null, async ({ ctx, body }) => {
  const email = str(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) fail(400, 'Email and password are required')
  const user = await ctx.store.one('users', { email })
  if (!user || !(await ctx.verify(password, user.password))) fail(401, 'Invalid email or password')
  if (user.disabled) fail(403, 'This account has been disabled')
  return { token: await ctx.signToken(user), user: publicUser(user, await getSettings(ctx)) }
})

route('GET', '/api/auth/me', 'user', async ({ ctx, user }) => ({ user: publicUser(user, await getSettings(ctx)) }))

// Revokes every token issued so far for this user (all devices) by bumping tokenVersion.
route('POST', '/api/auth/logout', 'user', async ({ ctx, user }) => {
  await ctx.store.atomic('users', { _id: user._id }, { $inc: { tokenVersion: 1 } })
  return { message: 'Logged out; existing tokens revoked' }
})

// ---------- reading list ----------
async function listFor(ctx, userId) {
  const u = await ctx.store.get('users', userId)
  const now = nowOf(ctx)
  const books = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  return (u.readingList || []).filter((e) => books.has(String(e.book))).map((e) => ({ book: bookOut(books.get(String(e.book)), now), status: e.status, addedAt: e.addedAt, startedAt: e.startedAt, finishedAt: e.finishedAt }))
}
route('GET', '/api/me/reading-list', 'user', async ({ ctx, user }) => listFor(ctx, user._id))
route('PUT', '/api/me/reading-list/:bookId', 'user', async ({ ctx, params, body, user }) => {
  if (!isId(params.bookId)) fail(400, 'Invalid book id')
  const status = body.status ?? 'want'
  if (!READING_STATUSES.includes(status)) fail(400, `status must be one of: ${READING_STATUSES.join(', ')}`)
  if (!(await ctx.store.get('books', params.bookId))) fail(404, 'Book not found')
  const u = await ctx.store.get('users', user._id)
  const list = u.readingList || []
  const e = list.find((x) => String(x.book) === params.bookId)
  const now = ctx.now()
  let finishedAt = e?.finishedAt
  if (status === 'finished') {
    finishedAt = now
    if (body.finishedAt) {
      const d = new Date(body.finishedAt)
      if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) fail(400, 'finishedAt must be a valid date that is not in the future')
      finishedAt = d.toISOString()
    } else if (e?.status === 'finished' && e.finishedAt) finishedAt = e.finishedAt
  }
  const next = { book: params.bookId, status, addedAt: e?.addedAt || now, ...(status === 'reading' ? { startedAt: e?.startedAt || now } : e?.startedAt ? { startedAt: e.startedAt } : {}), ...(status === 'finished' ? { finishedAt } : {}) }
  await ctx.store.update('users', user._id, { readingList: e ? list.map((x) => (String(x.book) === params.bookId ? next : x)) : [...list, next] })
  return listFor(ctx, user._id)
})
route('DELETE', '/api/me/reading-list/:bookId', 'user', async ({ ctx, params, user }) => {
  if (!isId(params.bookId)) fail(400, 'Invalid book id')
  await ctx.store.atomic('users', { _id: user._id }, { $pull: { readingList: { book: params.bookId } } })
  return listFor(ctx, user._id)
})

// ---------- goal, stats, activity ----------
route('PUT', '/api/me/goal', 'user', async ({ ctx, body, user }) => {
  const year = int(body.year, { min: 2000, max: 2100, label: 'year' })
  const nowYear = nowOf(ctx).getUTCFullYear()
  if (Math.abs(year - nowYear) > 1) fail(400, 'Set a goal for this year or next year')
  const books = int(body.books, { min: 1, max: 365, label: 'books' })
  await ctx.store.update('users', user._id, { goal: { year, books } })
  return { goal: { year, books } }
})
route('DELETE', '/api/me/goal', 'user', async ({ ctx, user }) => {
  await ctx.store.update('users', user._id, { goal: null })
  return { goal: null }
})

route('GET', '/api/me/stats', 'user', async ({ ctx, query, user }) => {
  const u = await ctx.store.get('users', user._id)
  const year = Number(query.year) || nowOf(ctx).getUTCFullYear()
  const list = await listFor(ctx, user._id)
  const activity = await ctx.store.find('activity', { user: String(user._id) })
  const finished = list.filter((e) => e.status === 'finished').map((e) => ({ book: e.book, finishedAt: e.finishedAt }))
  const stats = readingStats({ finished, activity, goal: u.goal, today: today(ctx), year })
  return { ...stats, goalRaw: u.goal || null, finished: finished.filter((f) => f.finishedAt && new Date(f.finishedAt).getUTCFullYear() === year).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)), reading: list.filter((e) => e.status === 'reading') }
})

route('POST', '/api/me/activity', 'user', async ({ ctx, body, user }) => {
  const minutes = num(body.minutes, { min: 0, max: 240, label: 'minutes' })
  const server = today(ctx)
  let date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : server
  if (date < addDays(server, -1) || date > addDays(server, 1)) date = server
  const pages = body.pages === undefined ? 0 : int(body.pages, { min: 0, max: 500, label: 'pages' })
  const ok = await ctx.store.atomic('activity', { user: String(user._id), date }, { $inc: { minutes, pages } })
  if (!ok) await ctx.store.insert('activity', { user: String(user._id), date, minutes, pages })
  return { date, minutes }
})

// ---------- reader state ----------
const COLORS = ['yellow', 'green', 'blue', 'pink']
route('GET', '/api/me/reader/:bookId', 'user', async ({ ctx, params, user }) => {
  if (!isId(params.bookId)) fail(400, 'Invalid book id')
  const s = await ctx.store.one('readerStates', { user: String(user._id), book: params.bookId })
  return s || { book: params.bookId, progress: null, bookmarks: [], highlights: [] }
})
route('PUT', '/api/me/reader/:bookId', 'user', async ({ ctx, params, body, user }) => {
  if (!isId(params.bookId)) fail(400, 'Invalid book id')
  if (!(await ctx.store.get('books', params.bookId))) fail(404, 'Book not found')
  const patch = { updatedAt: ctx.now() }
  if (body.progress !== undefined) {
    const p = body.progress || {}
    patch.progress = { chapter: int(p.chapter, { min: 0, max: 200, label: 'chapter' }), para: int(p.para, { min: 0, max: 5000, label: 'paragraph' }), pct: Math.round(num(p.pct, { min: 0, max: 100, label: 'pct' }) * 10) / 10 }
  }
  if (body.bookmarks !== undefined) {
    if (!Array.isArray(body.bookmarks) || body.bookmarks.length > 100) fail(400, 'At most 100 bookmarks')
    patch.bookmarks = body.bookmarks.map((b) => ({ id: str(b.id).slice(0, 40) || ctx.newId(), chapter: int(b.chapter, { min: 0, max: 200, label: 'chapter' }), para: int(b.para, { min: 0, max: 5000, label: 'paragraph' }), label: str(b.label).slice(0, 80), createdAt: str(b.createdAt) || ctx.now() }))
  }
  if (body.highlights !== undefined) {
    if (!Array.isArray(body.highlights) || body.highlights.length > 500) fail(400, 'At most 500 highlights')
    patch.highlights = body.highlights.map((h) => ({
      id: str(h.id).slice(0, 40) || ctx.newId(),
      chapter: int(h.chapter, { min: 0, max: 200, label: 'chapter' }),
      para: int(h.para, { min: 0, max: 5000, label: 'paragraph' }),
      start: int(h.start, { min: 0, max: 20000, label: 'start' }),
      end: int(h.end, { min: 0, max: 20000, label: 'end' }),
      text: str(h.text).slice(0, 500),
      note: str(h.note).slice(0, 500),
      color: COLORS.includes(h.color) ? h.color : 'yellow',
      createdAt: str(h.createdAt) || ctx.now(),
    }))
  }
  const key = { user: String(user._id), book: params.bookId }
  const have = await ctx.store.one('readerStates', key)
  return have ? ctx.store.update('readerStates', have._id, patch) : ctx.store.insert('readerStates', { ...key, bookmarks: [], highlights: [], progress: null, ...patch })
})

// ---------- digital library ----------
route('GET', '/api/me/library', 'user', async ({ ctx, user }) => {
  await settlePreorders(ctx)
  const now = nowOf(ctx)
  const books = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  const orders = (await ctx.store.find('orders', { user: String(user._id), status: { $ne: 'cancelled' } }, { sort: { createdAt: -1 } })).filter((o) => !/^(pending|expired)/.test(o.paymentStatus || ''))
  const states = new Map((await ctx.store.find('readerStates', { user: String(user._id) })).map((s) => [String(s.book), s]))
  const out = new Map()
  for (const o of orders) {
    for (const it of o.items) {
      if (it.kind === 'giftcard' || !isDigital(it.format) || it.refunded) continue
      const b = books.get(String(it.book))
      if (!b) continue
      const e = out.get(String(b._id)) || { book: bookOut(b, now), formats: [], purchasedAt: o.createdAt, orderId: o._id, releasesAt: isUpcoming(b, now) ? b.publishedAt : null }
      if (!e.formats.includes(it.format)) e.formats.push(it.format)
      out.set(String(b._id), e)
    }
  }
  return [...out.values()].map((e) => {
    const s = states.get(String(e.book._id))
    return { ...e, progress: s?.progress || null, lastReadAt: s?.updatedAt || null, highlights: s?.highlights?.length || 0, bookmarks: s?.bookmarks?.length || 0 }
  }).sort((a, b) => String(b.lastReadAt || b.purchasedAt).localeCompare(String(a.lastReadAt || a.purchasedAt)))
})

// ---------- recommendations ----------
route('GET', '/api/me/recommendations', 'user', async ({ ctx, user }) => {
  const now = nowOf(ctx)
  const books = (await getBooks(ctx)).filter((b) => !isUpcoming(b, now))
  const byId = new Map(books.map((b) => [String(b._id), b]))
  const u = await ctx.store.get('users', user._id)
  const list = (u.readingList || []).slice().sort((a, b) => String(b.finishedAt || b.startedAt || b.addedAt).localeCompare(String(a.finishedAt || a.startedAt || a.addedAt)))
  const orders = await ctx.store.find('orders', {}, { sort: { createdAt: -1 }, limit: 400 })
  const together = new Map()
  const bump = (a, b) => ((together.get(a) || together.set(a, new Map()).get(a)).set(b, (together.get(a).get(b) || 0) + 1))
  for (const o of orders) {
    const ids = [...new Set(o.items.filter((i) => i.kind !== 'giftcard').map((i) => String(i.book)))]
    for (const a of ids) for (const b of ids) if (a !== b) bump(a, b)
  }
  const mine = orders.filter((o) => String(o.user) === String(user._id) && o.status !== 'cancelled')
  const bought = [...new Set(mine.flatMap((o) => o.items.filter((i) => i.kind !== 'giftcard').map((i) => String(i.book))))]
  const exclude = new Set([...list.map((e) => String(e.book)), ...bought])
  const kinds = new Map()
  for (const e of list) if (e.status !== 'want') kinds.set(String(e.book), e.status === 'finished' ? 'finished' : 'reading')
  const seedIds = [...list.filter((e) => e.status !== 'want').map((e) => String(e.book)), ...bought]
  const seeds = [...new Set(seedIds)].map((id) => byId.get(id)).filter(Boolean)
  const sections = recommendations(books, { seeds, exclude, together, kindOf: (b) => kinds.get(String(b._id)) || 'purchased' }, { sections: 3, perSection: 6 })
  const follows = await ctx.store.find('follows', { user: String(user._id) })
  if (follows.length) {
    const used = new Set(sections.flatMap((s) => s.books.map((b) => String(b._id))))
    const picks = books.filter((b) => follows.some((f) => f.author === slugify(b.author)) && !exclude.has(String(b._id)) && !used.has(String(b._id))).sort((a, b) => b.rating - a.rating).slice(0, 6)
    if (picks.length) sections.push({ because: null, kind: 'follow', books: picks })
  }
  const wish = list.filter((e) => e.status === 'want').length
  return {
    sections: sections.map((s) => ({ ...s, books: s.books.map((b) => bookOut(b, now)) })),
    popular: books.slice().sort((a, b) => b.sold - a.sold).filter((b) => !exclude.has(String(b._id))).slice(0, 6).map((b) => bookOut(b, now)),
    wishlistCount: wish,
  }
})

// ---------- notifications ----------
route('GET', '/api/me/notifications', 'user', async ({ ctx, user }) => {
  const items = await ctx.store.find('notifications', { user: String(user._id) }, { sort: { createdAt: -1 }, limit: 60 })
  return { items, unread: items.filter((n) => !n.read).length }
})
route('POST', '/api/me/notifications/read', 'user', async ({ ctx, body, user }) => {
  const rows = await ctx.store.find('notifications', { user: String(user._id), read: false })
  for (const n of rows) if (body.all || (Array.isArray(body.ids) && body.ids.includes(String(n._id)))) await ctx.store.update('notifications', n._id, { read: true })
  return { ok: true }
})
route('DELETE', '/api/me/notifications', 'user', async ({ ctx, user }) => ({ removed: await ctx.store.removeWhere('notifications', { user: String(user._id) }) }))

// ---------- wishlist sharing ----------
route('GET', '/api/me/wishlist/share', 'user', async ({ user }) => ({ enabled: !!user.wishlistToken, token: user.wishlistToken || null }))
route('POST', '/api/me/wishlist/share', 'user', async ({ ctx, body, user }) => {
  if (body.enabled === false) {
    await ctx.store.update('users', user._id, { wishlistToken: null })
    return { enabled: false, token: null }
  }
  const token = user.wishlistToken || ctx.newId() + ctx.newId().slice(0, 8)
  await ctx.store.update('users', user._id, { wishlistToken: token })
  return { enabled: true, token }
})
route('GET', '/api/shared/wishlist/:token', null, async ({ ctx, params }) => {
  const owner = params.token.length > 20 ? await ctx.store.one('users', { wishlistToken: params.token }) : null
  if (!owner) fail(404, 'This wishlist link is not active')
  const list = (await listFor(ctx, owner._id)).filter((e) => e.status === 'want')
  return { owner: owner.name.split(' ')[0], books: list.map((e) => ({ book: e.book, addedAt: e.addedAt })) }
})

