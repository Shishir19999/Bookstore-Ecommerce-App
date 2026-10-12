// Community and merchandising routes: authors, events, series, collections, box sets and book clubs.
import { route, fail, str, text, int, num, notify, sortBy } from './framework.mjs'
import { slugify, round2, isStaff, EVENT_TYPES, isUpcoming, defaultFormat } from './rules.mjs'
import { norm } from './search.mjs'
import { getBooks, nowOf, bookOut } from './m-catalog.mjs'

const isId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{2,40}$/.test(s)

// ---------- authors ----------
async function authorIndex(ctx) {
  const books = await getBooks(ctx)
  const profiles = new Map((await ctx.store.find('authors', {})).map((p) => [p.slug, p]))
  const follows = await ctx.store.find('follows', {})
  const by = new Map()
  for (const b of books) {
    const slug = slugify(b.author)
    const e = by.get(slug) || { slug, name: b.author, books: [] }
    e.books.push(b)
    by.set(slug, e)
  }
  return { by, profiles, follows }
}

function authorStats(books) {
  const rated = books.filter((b) => b.numReviews > 0)
  return {
    count: books.length,
    genres: [...new Set(books.map((b) => b.genre).filter(Boolean))],
    avgRating: rated.length ? Math.round((rated.reduce((s, b) => s + b.rating, 0) / rated.length) * 10) / 10 : 0,
    sold: books.reduce((s, b) => s + (b.sold || 0), 0),
  }
}

route('GET', '/api/authors', null, async ({ ctx, query, user }) => {
  const { by, profiles, follows } = await authorIndex(ctx)
  const q = norm(query.search)
  const mine = new Set(user ? follows.filter((f) => String(f.user) === String(user._id)).map((f) => f.author) : [])
  const out = [...by.values()]
    .filter((a) => !q || norm(a.name).includes(q))
    .map((a) => ({ slug: a.slug, name: a.name, bookCount: a.books.length, genres: [...new Set(a.books.map((b) => b.genre).filter(Boolean))], followers: follows.filter((f) => f.author === a.slug).length, following: mine.has(a.slug), bio: profiles.get(a.slug)?.bio || '', sold: a.books.reduce((s, b) => s + (b.sold || 0), 0) }))
  return { authors: sortBy(out, 'name') }
})

async function authorPage(ctx, name, user) {
  const { by, profiles, follows } = await authorIndex(ctx)
  const key = slugify(name)
  const entry = by.get(key)
  if (!entry) fail(404, 'Author not found')
  const now = nowOf(ctx)
  const books = entry.books.slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  const events = (await ctx.store.find('events', { authorSlug: key, startsAt: { $gte: ctx.now() } }, { sort: { startsAt: 1 } })).map((e) => ({ ...e, going: (e.rsvps || []).length, joined: !!user && (e.rsvps || []).includes(String(user._id)) }))
  const seriesNames = [...new Set(books.map((b) => b.series?.name).filter(Boolean))]
  return {
    author: entry.name,
    slug: key,
    books: books.map((b) => bookOut(b, now)),
    stats: authorStats(books),
    profile: profiles.get(key) || null,
    followers: follows.filter((f) => f.author === key).length,
    following: !!user && follows.some((f) => f.author === key && String(f.user) === String(user._id)),
    events,
    series: seriesNames.map((n) => ({ name: n, slug: slugify(n), count: books.filter((b) => b.series?.name === n).length })),
  }
}
route('GET', '/api/books/author/:name', null, async ({ ctx, params, user }) => authorPage(ctx, params.name, user))
route('GET', '/api/authors/:name', null, async ({ ctx, params, user }) => authorPage(ctx, params.name, user))

route('POST', '/api/authors/:slug/follow', 'user', async ({ ctx, params, user }) => {
  const { by, follows } = await authorIndex(ctx)
  const a = by.get(params.slug)
  if (!a) fail(404, 'Author not found')
  if (!follows.some((f) => f.author === a.slug && String(f.user) === String(user._id))) await ctx.store.insert('follows', { user: String(user._id), author: a.slug, name: a.name, createdAt: ctx.now() })
  return { following: true, followers: (await ctx.store.count('follows', { author: a.slug })) }
})
route('DELETE', '/api/authors/:slug/follow', 'user', async ({ ctx, params, user }) => {
  await ctx.store.removeWhere('follows', { author: params.slug, user: String(user._id) })
  return { following: false, followers: await ctx.store.count('follows', { author: params.slug }) }
})
route('GET', '/api/me/follows', 'user', async ({ ctx, user }) => ctx.store.find('follows', { user: String(user._id) }, { sort: { name: 1 } }))

route('PUT', '/api/staff/authors/:slug', 'staff', async ({ ctx, params, body }) => {
  const { by } = await authorIndex(ctx)
  const a = by.get(params.slug)
  if (!a) fail(404, 'Author not found')
  const data = { slug: a.slug, name: a.name, bio: text(body, 'bio', { max: 1200 }) ?? '', born: text(body, 'born', { max: 40 }) ?? '', location: text(body, 'location', { max: 80 }) ?? '', website: text(body, 'website', { max: 200 }) ?? '' }
  if (data.website && !/^https?:\/\//i.test(data.website)) fail(400, 'website must start with http:// or https://')
  const have = await ctx.store.one('authors', { slug: a.slug })
  return have ? ctx.store.update('authors', have._id, data) : ctx.store.insert('authors', { ...data, createdAt: ctx.now() })
})
route('GET', '/api/staff/authors', 'staff', async ({ ctx }) => {
  const { by, profiles, follows } = await authorIndex(ctx)
  return sortBy([...by.values()].map((a) => ({ slug: a.slug, name: a.name, bookCount: a.books.length, followers: follows.filter((f) => f.author === a.slug).length, ...(profiles.get(a.slug) ? { bio: profiles.get(a.slug).bio, born: profiles.get(a.slug).born, location: profiles.get(a.slug).location, website: profiles.get(a.slug).website } : { bio: '', born: '', location: '', website: '' }) })), 'name')
})

// ---------- generic staff CRUD helper ----------
function crud(base, coll, parse, { onCreate } = {}) {
  route('POST', `/api/staff/${base}`, 'staff', async ({ ctx, body }) => {
    const data = await parse(ctx, body, false)
    const doc = await ctx.store.insert(coll, { ...data, createdAt: ctx.now() })
    if (onCreate) await onCreate(ctx, doc)
    return [201, doc]
  })
  route('PUT', `/api/staff/${base}/:id`, 'staff', async ({ ctx, params, body }) => {
    const have = isId(params.id) ? await ctx.store.get(coll, params.id) : null
    if (!have) fail(404, 'Not found')
    return ctx.store.update(coll, have._id, await parse(ctx, body, true, have))
  })
  route('DELETE', `/api/staff/${base}/:id`, 'staff', async ({ ctx, params }) => {
    if (!(isId(params.id) && (await ctx.store.remove(coll, params.id)))) fail(404, 'Not found')
    return { deleted: true, id: params.id }
  })
}

async function checkBookIds(ctx, ids, { min = 1, max = 24 } = {}) {
  if (!Array.isArray(ids) || ids.length < min || ids.length > max) fail(400, `Choose between ${min} and ${max} books`)
  const clean = [...new Set(ids.map(String))]
  for (const id of clean) if (!isId(id) || !(await ctx.store.get('books', id))) fail(400, 'One of the selected books does not exist')
  return clean
}
async function uniqueSlug(ctx, coll, title, selfId) {
  const base = slugify(title) || 'item'
  const taken = new Set((await ctx.store.find(coll, {})).filter((x) => String(x._id) !== String(selfId)).map((x) => x.slug))
  let s = base
  for (let i = 2; taken.has(s); i++) s = `${base}-${i}`
  return s
}

// ---------- events ----------
async function parseEvent(ctx, body, partial, have) {
  const d = {}
  const title = text(body, 'title', { max: 120, required: !partial })
  if (title !== undefined) d.title = title
  const author = text(body, 'author', { max: 120 })
  if (author !== undefined) {
    d.author = author
    d.authorSlug = slugify(author)
  }
  if (body.type !== undefined || !partial) {
    if (!EVENT_TYPES.includes(body.type)) fail(400, `type must be one of: ${EVENT_TYPES.join(', ')}`)
    d.type = body.type
  }
  if (body.startsAt !== undefined || !partial) {
    const t = new Date(body.startsAt)
    if (Number.isNaN(t.getTime())) fail(400, 'startsAt must be a valid date and time')
    d.startsAt = t.toISOString()
  }
  const loc = text(body, 'location', { max: 160 })
  if (loc !== undefined) d.location = loc
  if (body.online !== undefined) d.online = !!body.online
  const desc = text(body, 'description', { max: 800 })
  if (desc !== undefined) d.description = desc
  if (body.capacity !== undefined && body.capacity !== '') d.capacity = int(body.capacity, { min: 0, max: 5000, label: 'capacity' })
  if (!partial) Object.assign(d, { rsvps: [], capacity: d.capacity ?? 0, location: d.location ?? 'Folio Books, 12 Quill Lane', online: !!d.online })
  return { ...(have ? {} : {}), ...d }
}
crud('events', 'events', parseEvent, {
  onCreate: async (ctx, ev) => {
    if (!ev.authorSlug) return
    const follows = await ctx.store.find('follows', { author: ev.authorSlug })
    await notify(ctx, follows.map((f) => f.user), { type: 'event', title: `${ev.author} is hosting an event`, body: ev.title, link: '/events' })
  },
})
route('GET', '/api/staff/events', 'staff', async ({ ctx }) => (await ctx.store.find('events', {}, { sort: { startsAt: -1 } })).map((e) => ({ ...e, going: (e.rsvps || []).length })))
route('GET', '/api/events', null, async ({ ctx, query, user }) => {
  const when = query.when === 'past' ? 'past' : 'upcoming'
  const filter = when === 'past' ? { startsAt: { $lt: ctx.now() } } : { startsAt: { $gte: ctx.now() } }
  if (str(query.author)) filter.authorSlug = str(query.author)
  const rows = await ctx.store.find('events', filter, { sort: { startsAt: when === 'past' ? -1 : 1 }, limit: 60 })
  return { events: rows.map((e) => ({ ...e, going: (e.rsvps || []).length, joined: !!user && (e.rsvps || []).includes(String(user._id)), full: e.capacity > 0 && (e.rsvps || []).length >= e.capacity })) }
})
route('POST', '/api/events/:id/rsvp', 'user', async ({ ctx, params, body, user }) => {
  const e = isId(params.id) ? await ctx.store.get('events', params.id) : null
  if (!e) fail(404, 'Event not found')
  if (e.startsAt < ctx.now()) fail(409, 'This event has already taken place')
  const has = (e.rsvps || []).includes(String(user._id))
  const want = body.going === undefined ? !has : !!body.going
  if (want && !has) {
    if (e.capacity > 0 && (e.rsvps || []).length >= e.capacity) fail(409, 'This event is full')
    await ctx.store.atomic('events', { _id: e._id }, { $addToSet: { rsvps: String(user._id) } })
  } else if (!want && has) await ctx.store.atomic('events', { _id: e._id }, { $pull: { rsvps: String(user._id) } })
  return { joined: want, going: (e.rsvps || []).length + (want && !has ? 1 : !want && has ? -1 : 0) }
})

// ---------- series ----------
async function seriesList(ctx) {
  const books = await getBooks(ctx)
  const infos = new Map((await ctx.store.find('series', {})).map((s) => [s.slug, s]))
  const by = new Map()
  for (const b of books) {
    if (!b.series?.name) continue
    const e = by.get(b.series.slug) || { name: b.series.name, slug: b.series.slug, books: [] }
    e.books.push(b)
    by.set(b.series.slug, e)
  }
  return [...by.values()].map((s) => ({ ...s, books: s.books.sort((a, b) => (a.series.number || 0) - (b.series.number || 0)), description: infos.get(s.slug)?.description || '' }))
}
route('GET', '/api/series', null, async ({ ctx }) => {
  const now = nowOf(ctx)
  return { series: (await seriesList(ctx)).map((s) => ({ name: s.name, slug: s.slug, description: s.description, author: s.books[0].author, count: s.books.length, genre: s.books[0].genre, books: s.books.slice(0, 3).map((b) => bookOut(b, now)) })) }
})
route('GET', '/api/series/:slug', null, async ({ ctx, params }) => {
  const s = (await seriesList(ctx)).find((x) => x.slug === params.slug)
  if (!s) fail(404, 'Series not found')
  const now = nowOf(ctx)
  const ids = s.books.map((b) => String(b._id)).sort().join()
  const bundle = (await ctx.store.find('bundles', {})).find((b) => b.bookIds.map(String).sort().join() === ids) || null
  return { series: { name: s.name, slug: s.slug, description: s.description, author: s.books[0].author }, books: s.books.map((b) => bookOut(b, now)), bundle }
})
route('PUT', '/api/staff/series/:slug', 'staff', async ({ ctx, params, body }) => {
  const s = (await seriesList(ctx)).find((x) => x.slug === params.slug)
  if (!s) fail(404, 'Series not found')
  const description = text(body, 'description', { max: 600 }) ?? ''
  const have = await ctx.store.one('series', { slug: s.slug })
  return have ? ctx.store.update('series', have._id, { description }) : ctx.store.insert('series', { slug: s.slug, name: s.name, description, createdAt: ctx.now() })
})

// ---------- collections ----------
crud('collections', 'collections', async (ctx, body, partial, have) => {
  const d = {}
  const title = text(body, 'title', { max: 80, required: !partial })
  if (title !== undefined) {
    d.title = title
    d.slug = await uniqueSlug(ctx, 'collections', title, have?._id)
  }
  const blurb = text(body, 'blurb', { max: 300 })
  if (blurb !== undefined) d.blurb = blurb
  if (body.bookIds !== undefined || !partial) d.bookIds = await checkBookIds(ctx, body.bookIds, { min: 1, max: 24 })
  if (body.featured !== undefined) d.featured = !!body.featured
  return d
})
const miniBook = (b, now) => ({ _id: b._id, title: b.title, author: b.author, genre: b.genre, image: b.image, price: b.price, rating: b.rating, numReviews: b.numReviews, upcoming: isUpcoming(b, now) })
route('GET', '/api/collections', null, async ({ ctx }) => {
  const now = nowOf(ctx)
  const byId = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  const rows = await ctx.store.find('collections', {}, { sort: { createdAt: 1 } })
  return { collections: rows.map((c) => ({ ...c, count: c.bookIds.filter((id) => byId.has(String(id))).length, covers: c.bookIds.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 3).map((b) => miniBook(b, now)) })) }
})
route('GET', '/api/collections/:slug', null, async ({ ctx, params }) => {
  const c = await ctx.store.one('collections', { slug: params.slug })
  if (!c) fail(404, 'Collection not found')
  const now = nowOf(ctx)
  const byId = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  return { collection: c, books: c.bookIds.map((id) => byId.get(String(id))).filter(Boolean).map((b) => bookOut(b, now)) }
})

// ---------- box sets ----------
crud('bundles', 'bundles', async (ctx, body, partial, have) => {
  const d = {}
  const title = text(body, 'title', { max: 80, required: !partial })
  if (title !== undefined) {
    d.title = title
    d.slug = await uniqueSlug(ctx, 'bundles', title, have?._id)
  }
  const description = text(body, 'description', { max: 400 })
  if (description !== undefined) d.description = description
  if (body.bookIds !== undefined || !partial) d.bookIds = await checkBookIds(ctx, body.bookIds, { min: 2, max: 8 })
  if (body.discountPct !== undefined || !partial) d.discountPct = num(body.discountPct, { min: 1, max: 60, label: 'discountPct' })
  return d
})
async function bundleView(ctx, b, byId, now) {
  const books = b.bookIds.map((id) => byId.get(String(id))).filter(Boolean)
  const listPrice = round2(books.reduce((s, x) => s + defaultFormat(x).price, 0))
  const price = round2(listPrice * (1 - b.discountPct / 100))
  return { ...b, books: books.map((x) => bookOut(x, now)), listPrice, price, savings: round2(listPrice - price) }
}
route('GET', '/api/bundles', null, async ({ ctx }) => {
  const now = nowOf(ctx)
  const byId = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  const rows = await ctx.store.find('bundles', {}, { sort: { createdAt: 1 } })
  return { bundles: await Promise.all(rows.map((b) => bundleView(ctx, b, byId, now))) }
})
route('GET', '/api/bundles/:slug', null, async ({ ctx, params }) => {
  const b = await ctx.store.one('bundles', { slug: params.slug })
  if (!b) fail(404, 'Box set not found')
  const byId = new Map((await getBooks(ctx)).map((x) => [String(x._id), x]))
  return bundleView(ctx, b, byId, nowOf(ctx))
})

// ---------- book clubs ----------
const clubOut = (c, user, books) => {
  const pickBook = c.pick?.book ? books.get(String(c.pick.book)) : null
  return {
    _id: c._id,
    name: c.name,
    description: c.description,
    owner: c.owner,
    ownerName: c.ownerName,
    members: (c.members || []).length,
    joined: !!user && (c.members || []).includes(String(user._id)),
    isOwner: !!user && String(c.owner) === String(user._id),
    pick: c.pick ? { ...c.pick, book: pickBook ? miniBook(pickBook, new Date()) : null } : null,
    createdAt: c.createdAt,
  }
}
const booksMap = async (ctx) => new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))

route('GET', '/api/clubs', null, async ({ ctx, user }) => {
  const books = await booksMap(ctx)
  const rows = await ctx.store.find('clubs', {})
  return { clubs: sortBy(rows.map((c) => clubOut(c, user, books)), '-members', 'name') }
})
route('POST', '/api/clubs', 'user', async ({ ctx, body, user }) => {
  const name = text(body, 'name', { max: 60, min: 3, required: true, label: 'Club name' })
  const description = text(body, 'description', { max: 300 }) || ''
  if (await ctx.store.one('clubs', { nameKey: name.toLowerCase() })) fail(409, 'A club with this name already exists')
  const mine = await ctx.store.count('clubs', { owner: String(user._id) })
  if (mine >= 5) fail(409, 'You can run up to 5 clubs')
  const c = await ctx.store.insert('clubs', { name, nameKey: name.toLowerCase(), description, owner: String(user._id), ownerName: user.name, members: [String(user._id)], pick: null, history: [], createdAt: ctx.now() })
  return [201, clubOut(c, user, await booksMap(ctx))]
})
route('GET', '/api/clubs/:id', null, async ({ ctx, params, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  const books = await booksMap(ctx)
  const threads = await ctx.store.find('threads', { club: String(c._id) }, { sort: { lastPostAt: -1 } })
  const users = new Map((await ctx.store.find('users', { _id: { $in: c.members || [] } })).map((u) => [String(u._id), u.name]))
  return {
    club: clubOut(c, user, books),
    members: (c.members || []).map((id) => ({ id, name: users.get(String(id)) || 'Reader' })),
    history: (c.history || []).map((h) => ({ ...h, book: books.get(String(h.book)) ? miniBook(books.get(String(h.book)), new Date()) : null })),
    threads: threads.map((t) => ({ _id: t._id, title: t.title, authorName: t.authorName, posts: t.posts || 0, lastPostAt: t.lastPostAt, createdAt: t.createdAt, pinned: !!t.pinned })),
  }
})
route('POST', '/api/clubs/:id/join', 'user', async ({ ctx, params, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  await ctx.store.atomic('clubs', { _id: c._id }, { $addToSet: { members: String(user._id) } })
  return { joined: true, members: new Set([...(c.members || []), String(user._id)]).size }
})
route('POST', '/api/clubs/:id/leave', 'user', async ({ ctx, params, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  if (String(c.owner) === String(user._id)) fail(409, 'The owner cannot leave the club')
  await ctx.store.atomic('clubs', { _id: c._id }, { $pull: { members: String(user._id) } })
  return { joined: false, members: Math.max(0, (c.members || []).length - 1) }
})
route('PUT', '/api/clubs/:id/pick', 'user', async ({ ctx, params, body, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  if (String(c.owner) !== String(user._id) && !isStaff(user)) fail(403, 'Only the club owner can choose the monthly pick')
  if (!isId(body.bookId) || !(await ctx.store.get('books', body.bookId))) fail(400, 'Choose a book from the catalogue')
  const month = /^\d{4}-\d{2}$/.test(str(body.month)) ? str(body.month) : ctx.now().slice(0, 7)
  const pick = { book: String(body.bookId), month, note: text(body, 'note', { max: 300 }) || '', discussAt: null }
  if (body.discussAt) {
    const d = new Date(body.discussAt)
    if (Number.isNaN(d.getTime())) fail(400, 'discussAt must be a valid date')
    pick.discussAt = d.toISOString()
  }
  const history = c.pick ? [...(c.history || []), c.pick].slice(-12) : c.history || []
  await ctx.store.update('clubs', c._id, { pick, history })
  const book = await ctx.store.get('books', body.bookId)
  await notify(ctx, (c.members || []).filter((m) => String(m) !== String(user._id)), { type: 'club', title: `${c.name}: new monthly pick`, body: book.title, link: `/clubs/${c._id}` })
  ctx.emit?.(`club:${c._id}`, 'pick', { clubId: String(c._id), bookId: pick.book })
  return clubOut({ ...c, pick, history }, user, await booksMap(ctx))
})

const isMember = (c, user) => (c.members || []).includes(String(user._id))
route('POST', '/api/clubs/:id/threads', 'user', async ({ ctx, params, body, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  if (!isMember(c, user)) fail(403, 'Join the club to start a discussion')
  const title = text(body, 'title', { max: 120, min: 3, required: true, label: 'Title' })
  const first = text(body, 'body', { max: 2000, min: 2, required: true, label: 'Message' })
  const now = ctx.now()
  const t = await ctx.store.insert('threads', { club: String(c._id), title, authorName: user.name, author: String(user._id), posts: 1, lastPostAt: now, createdAt: now })
  const post = await ctx.store.insert('posts', { thread: String(t._id), club: String(c._id), user: String(user._id), name: user.name, body: first, spoiler: !!body.spoiler, createdAt: now })
  ctx.emit?.(`club:${c._id}`, 'thread', { clubId: String(c._id), thread: { _id: t._id, title, authorName: user.name, posts: 1, lastPostAt: now, createdAt: now }, post })
  return [201, { thread: t, post }]
})
route('GET', '/api/clubs/:id/threads/:tid', null, async ({ ctx, params, user }) => {
  const t = isId(params.tid) ? await ctx.store.get('threads', params.tid) : null
  if (!t || String(t.club) !== params.id) fail(404, 'Discussion not found')
  const posts = await ctx.store.find('posts', { thread: String(t._id) }, { sort: { createdAt: 1 } })
  return { thread: t, posts: posts.map((p) => ({ ...p, mine: !!user && String(p.user) === String(user._id) })) }
})
route('POST', '/api/clubs/:id/threads/:tid/posts', 'user', async ({ ctx, params, body, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  const t = isId(params.tid) ? await ctx.store.get('threads', params.tid) : null
  if (!c || !t || String(t.club) !== String(c._id)) fail(404, 'Discussion not found')
  if (!isMember(c, user)) fail(403, 'Join the club to reply')
  const b = text(body, 'body', { max: 2000, min: 1, required: true, label: 'Message' })
  const now = ctx.now()
  const post = await ctx.store.insert('posts', { thread: String(t._id), club: String(c._id), user: String(user._id), name: user.name, body: b, spoiler: !!body.spoiler, createdAt: now })
  await ctx.store.atomic('threads', { _id: t._id }, { $inc: { posts: 1 }, $set: { lastPostAt: now } })
  ctx.emit?.(`club:${c._id}`, 'post', { clubId: String(c._id), threadId: String(t._id), post })
  return [201, { ...post, mine: true }]
})
route('DELETE', '/api/clubs/:id/threads/:tid/posts/:pid', 'user', async ({ ctx, params, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  const p = isId(params.pid) ? await ctx.store.get('posts', params.pid) : null
  if (!c || !p || String(p.thread) !== params.tid) fail(404, 'Post not found')
  if (String(p.user) !== String(user._id) && String(c.owner) !== String(user._id) && !isStaff(user)) fail(403, 'You can only remove your own posts')
  await ctx.store.remove('posts', p._id)
  await ctx.store.atomic('threads', { _id: p.thread }, { $inc: { posts: -1 } })
  ctx.emit?.(`club:${c._id}`, 'post-removed', { clubId: String(c._id), threadId: params.tid, postId: String(p._id) })
  return { deleted: true }
})
route('DELETE', '/api/clubs/:id', 'user', async ({ ctx, params, user }) => {
  const c = isId(params.id) ? await ctx.store.get('clubs', params.id) : null
  if (!c) fail(404, 'Club not found')
  if (String(c.owner) !== String(user._id) && !isStaff(user)) fail(403, 'Only the owner can delete the club')
  await ctx.store.removeWhere('posts', { club: String(c._id) })
  await ctx.store.removeWhere('threads', { club: String(c._id) })
  await ctx.store.remove('clubs', c._id)
  return { deleted: true }
})

