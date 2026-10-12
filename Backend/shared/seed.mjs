// Deterministic sample data used by the first-run seed (real mode) and the browser live preview.
// Every title, author and review is fictional, except the public-domain classics whose text comes from Project Gutenberg.
import { isPhysical, deriveBook, makeIsbn13, slugify, computeTotals, DEFAULT_SETTINGS, tierFor, round2, shortId, suggestedPrice } from './rules.mjs'
import { chaptersFor } from './reading.mjs'

const DAY = 86400000
export const SAMPLE_PASSWORD = 'Password123!'
export const SAMPLE_ACCOUNTS = [
  { role: 'user', name: 'Demo Reader', email: 'user@example.com' },
  { role: 'staff', name: 'Sam Staff', email: 'staff@example.com' },
  { role: 'admin', name: 'Ada Admin', email: 'admin@example.com' },
]
export const SAMPLE_GIFT_CODE = 'FOLI-OREA-DER5-2026'

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hashStr = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const SERIES = {
  'The Ashen Kingdoms': { desc: 'A caravan guard, a runaway scribe and a kingdom that redraws its own borders overnight.', titles: ["The Cartographer's Dragon", 'Ember Court', 'Wardens of the Ashen Road'] },
  'Orrin Vale Cycle': { desc: 'Lamplighters, borrowed memories and a city that glows with other people\'s pasts.', titles: ['The Lantern of Orrin Vale', 'Crown of Salt and Thorn'] },
  'Inspector Penhale Mysteries': { desc: 'Quiet villages, stopped clocks and one detective who is afraid of Ferris wheels.', titles: ["The Clockmaker's Alibi", 'Murder at Lantern Pier', 'Salt Marsh Ledger'] },
  'The Coroner Files': { desc: 'A retired coroner reopens the cases she signed off too quickly.', titles: ['A Quiet Inquest', 'The Ninth Guest', 'Tea at the Quarry House'] },
  'Kepler Road': { desc: 'Long-haul couriers, silent frequencies and voices that should not be there.', titles: ['Orbit of Quiet Machines', 'Last Signal from Kepler Road'] },
  'The Curious Shelf': { desc: 'Friendly field guides to tide pools, stars and the animals that surprise us.', titles: ['The Hidden Life of Tide Pools', 'Why Stars Twinkle', 'The Octopus Notebook'] },
}
const UPCOMING = [
  { title: 'The Glass Cartographer', author: 'Idris Wolfe', genre: 'Fantasy', series: ['The Ashen Kingdoms', 4], in: 21, price: 22.99, desc: 'The fourth Ashen Kingdoms adventure: a map that redraws itself, and a mapmaker who must decide whom to tell.' },
  { title: 'Kepler Road: Return Signal', author: 'Anselm Kade', genre: 'Science Fiction', series: ['Kepler Road', 3], in: 35, price: 18.99, desc: 'The courier follows the signal home and finds that someone has been waiting for her to answer.' },
  { title: 'Penhale and the Last Train', author: 'Harriet Lowell', genre: 'Mystery', series: ['Inspector Penhale Mysteries', 4], in: 14, price: 14.99, desc: 'A sleeper train, a locked compartment and a detective who really would rather have taken the bus.' },
  { title: 'Quiet Gardens of the Moon', author: 'Priya Nandakumar', genre: 'Science Fiction', in: 49, price: 17.99, desc: 'A horticulturist on a lunar station discovers that something in the greenhouse is listening.' },
]
const BIOS = [
  '{n} writes {g} for readers who like their stories patient and their endings earned. Early drafts are written by hand on the train.',
  '{n} grew up near the sea and still measures every story by how well it would read aloud. {g} is where the best ideas turn up.',
  'A former bookseller, {n} writes {g} in the early mornings and revises at the kitchen table, usually with a cat on the manuscript.',
  '{n} is the author of several well-loved titles in {g}, and an enthusiastic correspondent: every letter from a reader gets an answer.',
]
const PLACES = ['Lisbon', 'Leeds', 'Pune', 'Montreal', 'Hamburg', 'Lyon', 'Cape Town', 'Oslo', 'Melbourne', 'Seville']
const CLASSIC_BIOS = {
  'Jane Austen': 'English novelist (1775-1817) whose six finished novels, including Pride and Prejudice, remain the gold standard of the comedy of manners.',
  'Lewis Carroll': 'Pen name of Charles Dodgson (1832-1898), an Oxford mathematician who wrote Alice\'s Adventures in Wonderland for a friend\'s daughter on a boat trip.',
  'Arthur Conan Doyle': 'Scottish writer and physician (1859-1930), creator of Sherlock Holmes and Dr Watson.',
  'Charlotte Brontë': 'English novelist (1816-1855) and eldest of the Brontë sisters, author of Jane Eyre.',
  'Herman Melville': 'American novelist (1819-1891) whose Moby-Dick was little read in his lifetime and is now a cornerstone of the American canon.',
  'Mary Shelley': 'English novelist (1797-1851) who wrote Frankenstein at the age of eighteen.',
}

const defaultTags = (b) => [...(b.language && b.language !== 'English' ? ['translation'] : []), ...(b.pages && b.pages <= 200 ? ['short'] : []), ...(b.genre === 'Poetry' ? ['poetry'] : [])]

function formatsFor(base, stock, pages, r, i, { allDigital = false } = {}) {
  const f = [{ type: 'paperback', price: round2(base), stock, isbn: makeIsbn13(i * 4 + 1) }]
  f.push({ type: 'hardcover', price: suggestedPrice(base, 'hardcover'), stock: Math.floor(stock * 0.45), isbn: makeIsbn13(i * 4 + 2), edition: 'Collector hardcover' })
  f.push({ type: 'ebook', price: suggestedPrice(base, 'ebook'), isbn: makeIsbn13(i * 4 + 3) })
  if (allDigital || r() < 0.42) f.push({ type: 'audiobook', price: Math.max(7.99, suggestedPrice(base, 'audiobook')), isbn: makeIsbn13(i * 4 + 4), minutes: Math.round((pages || 200) * 1.7), narrator: ['Ellis Hart', 'Nadia Rowe', 'Tomas Ferreira', 'Imogen Park'][i % 4] })
  return f
}

export async function seedStore(ctx, { catalog, classics, people = true }) {
  const store = ctx.store
  const nowMs = new Date(ctx.now()).getTime()
  const at = (daysAgo, extra = 0) => new Date(nowMs - daysAgo * DAY - extra * 1000).toISOString()
  const r = rng(20261012)
  const settings = DEFAULT_SETTINGS

  // ---- books ----
  const docs = []
  catalog.books.forEach((b, i) => {
    const stock = b.stock
    const book = deriveBook({ ...b, slug: slugify(b.title), tags: [], formats: formatsFor(b.price, stock, b.pages, r, i + 1), publisher: ['Folio Press', 'Quill & Lantern', 'Harbour Lane', 'Northlight Books'][i % 4], createdAt: at(200) })
    book.tags = defaultTags(book)
    docs.push(book)
  })
  let n = catalog.books.length
  const classicBooks = Object.entries(classics).map(([slug, c], k) => {
    const book = deriveBook({
      title: c.title, slug, author: c.author, genre: c.genre, language: 'English', description: c.description,
      excerpt: chaptersFor({ slug, title: c.title, author: c.author, genre: c.genre }, classics)[0].paragraphs.slice(0, 2).join('\n\n'),
      image: '', pages: c.pages, sold: 90 - k * 9, rating: 0, numReviews: 0, publishedAt: at(300 + k * 11), publisher: 'Folio Classics', tags: ['classic', 'public-domain'], series: null, createdAt: at(300),
      formats: formatsFor(8.99, 40 + k * 6, c.pages, r, ++n, { allDigital: true }),
    })
    book.formats = book.formats.map((f) => (f.type === 'ebook' ? { ...f, price: 1.99 } : f))
    return deriveBook(book)
  })
  docs.push(...classicBooks)
  for (const [name, s] of Object.entries(SERIES)) {
    s.titles.forEach((t, idx) => {
      const b = docs.find((d) => d.title === t)
      if (b) b.series = { name, slug: slugify(name), number: idx + 1 }
    })
  }
  UPCOMING.forEach((u, k) => {
    const book = deriveBook({
      title: u.title, slug: slugify(u.title), author: u.author, genre: u.genre, language: 'English', description: u.desc,
      excerpt: 'Chapter one will be available to preview in the weeks before release.', image: '', pages: 300 + k * 24, sold: 0, rating: 0, numReviews: 0,
      publishedAt: new Date(nowMs + u.in * DAY).toISOString(), publisher: 'Folio Press', tags: ['pre-order'], createdAt: at(5),
      series: u.series ? { name: u.series[0], slug: slugify(u.series[0]), number: u.series[1] } : null,
      formats: formatsFor(u.price, 120, 300, r, ++n),
    })
    docs.push(book)
  })
  const books = []
  for (const d of docs) books.push(await store.insert('books', d))
  const byTitle = new Map(books.map((b) => [b.title, b]))
  const B = (t) => {
    const b = byTitle.get(t)
    if (!b) throw new Error(`seed: unknown title ${t}`)
    return b
  }
  const classicsList = classicBooks.map((b) => byTitle.get(b.title))

  // ---- authors, series ----
  const authors = [...new Set(books.map((b) => b.author))]
  for (const name of authors) {
    const gs = [...new Set(books.filter((b) => b.author === name).map((b) => b.genre))]
    const k = hashStr(name)
    await store.insert('authors', { slug: slugify(name), name, bio: CLASSIC_BIOS[name] || BIOS[k % BIOS.length].replace('{n}', name).replace('{g}', gs.join(' and ').toLowerCase()), born: '', location: CLASSIC_BIOS[name] ? '' : PLACES[k % PLACES.length], website: '', createdAt: at(150) })
  }
  for (const [name, s] of Object.entries(SERIES)) await store.insert('series', { slug: slugify(name), name, description: s.desc, createdAt: at(150) })

  // ---- box sets ----
  const bundlesDef = [
    { title: 'The Ashen Kingdoms Box Set', description: 'All three Ashen Kingdoms adventures in one box, with a gentle discount.', books: ["The Cartographer's Dragon", 'Ember Court', 'Wardens of the Ashen Road'], pct: 15 },
    { title: 'Inspector Penhale Trilogy', description: 'Three cases for the detective who would rather be anywhere else.', books: ["The Clockmaker's Alibi", 'Murder at Lantern Pier', 'Salt Marsh Ledger'], pct: 15 },
    { title: 'The Coroner Files Collection', description: 'Three quiet inquests, best read with a pot of tea.', books: ['A Quiet Inquest', 'The Ninth Guest', 'Tea at the Quarry House'], pct: 12 },
    { title: 'The Curious Shelf Set', description: 'Tide pools, twinkling stars and one remarkable octopus.', books: ['The Hidden Life of Tide Pools', 'Why Stars Twinkle', 'The Octopus Notebook'], pct: 10 },
    { title: 'Classic Starter Pack', description: 'Austen, Brontë and Carroll: three doors into the nineteenth-century novel.', books: ['Pride and Prejudice', 'Jane Eyre', "Alice's Adventures in Wonderland"], pct: 20 },
  ]
  const bundles = []
  for (const b of bundlesDef) bundles.push(await store.insert('bundles', { title: b.title, slug: slugify(b.title), description: b.description, bookIds: b.books.map((t) => String(B(t)._id)), discountPct: b.pct, createdAt: at(120) }))


  // ---- collections ----
  const released = books.filter((b) => new Date(b.publishedAt) < new Date(nowMs))
  const ids = (list) => list.map((b) => String(b._id))
  const cols = [
    { title: 'Rainy Day Reads', blurb: 'Slow-burn romances and cosy mysteries for when the weather stays outside.', list: [...released.filter((b) => b.genre === 'Romance').slice(0, 5), ...released.filter((b) => b.genre === 'Mystery').slice(0, 3)], featured: true },
    { title: 'Staff Picks', blurb: 'What the shop team keeps pressing into customers\' hands.', list: ['The Ninth Guest', 'Orbit of Quiet Machines', 'The Hidden Life of Tide Pools', 'Letters to the Lighthouse Keeper', 'Salt, Ink, Ash', 'Embers of the Paper Palace', 'Jane Eyre'].map(B), featured: true },
    { title: 'Short and Sweet', blurb: 'Under 200 pages and over before the kettle cools.', list: released.filter((b) => b.pages && b.pages <= 200).slice(0, 10), featured: false },
    { title: 'Read in Translation', blurb: 'Stories first written in Spanish, French, German and Hindi.', list: released.filter((b) => b.language !== 'English').slice(0, 10), featured: true },
    { title: 'Gifts Under $15', blurb: 'Lovely things to give that will not strain the budget.', list: released.filter((b) => b.price < 15).slice(0, 12), featured: false },
    { title: 'Quiet Classics', blurb: 'Six public-domain favourites, with e-book samples you can read right now.', list: classicsList, featured: true },
    { title: 'Build Better Software', blurb: 'Practical craft for people who ship code.', list: released.filter((b) => b.genre === 'Technology'), featured: false },
  ]
  for (const c of cols) await store.insert('collections', { title: c.title, slug: slugify(c.title), blurb: c.blurb, bookIds: ids(c.list), featured: c.featured, createdAt: at(100) })

  // ---- events ----
  const ev = [
    ['The Lantern of Orrin Vale: launch signing', 'Maren Ashdown', 'launch', 6, 'Folio Books, 12 Quill Lane', false, 40, 'Join us for the paperback launch, with a short reading and a signing queue that always seems to form.'],
    ['Maps and Dragons: an online Q&A', 'Idris Wolfe', 'qna', 12, 'Online', true, 0, 'Ask Idris anything about the Ashen Kingdoms, how maps get drawn and what happens in book four.'],
    ['An evening of quiet mysteries', 'Harriet Lowell', 'reading', 19, 'Folio Books, 12 Quill Lane', false, 30, 'Harriet reads from the next Penhale case and takes questions about stopped clocks.'],
    ['Tide pool walk and sketchbook workshop', 'Rosalind Pryce', 'workshop', 27, 'Harbour Lane car park (meet at low tide)', false, 20, 'A guided walk at low tide followed by a pocket sketching workshop. Wear waterproof boots.'],
    ['Maple Row signing and tea', 'Dana Okafor', 'signing', 40, 'Folio Books, 12 Quill Lane', false, 50, 'Tea, pastries from the street\'s favourite bakery and a signing for Second Chances at Maple Row.'],
    ['Letters read aloud', 'Clara Whitmore', 'reading', -20, 'Folio Books, 12 Quill Lane', false, 30, 'A past event: readings of letters from the Lighthouse Keeper correspondence.'],
    ['Testing Without Tears: a live workshop', 'Joanna Kessler', 'workshop', -45, 'Online', true, 0, 'A past online workshop on practical testing habits for small teams.'],
  ]
  for (const [title, author, type, inDays, location, online, capacity, description] of ev) {
    await store.insert('events', { title, author, authorSlug: slugify(author), type, startsAt: new Date(nowMs + inDays * DAY + 18 * 3600000).toISOString(), location, online, capacity, description, rsvps: [], createdAt: at(30) })
  }

  // ---- coupons ----
  for (const c of [
    { code: 'WELCOME10', description: '10% off your order', type: 'percent', value: 10, used: 12 },
    { code: 'READMORE5', description: '$5 off orders over $30', type: 'fixed', value: 5, minSubtotal: 30, used: 7 },
    { code: 'BOXSET5', description: '$5 off orders over $50', type: 'fixed', value: 5, minSubtotal: 50, used: 3 },
    { code: 'SUMMER20', description: 'Expired summer sale (an example of an expired coupon)', type: 'percent', value: 20, expiresAt: at(30), used: 41 },
  ]) await store.insert('coupons', { minSubtotal: 0, expiresAt: null, usageLimit: 0, active: true, createdAt: at(120), ...c })

  // ---- catalogue reviews (people-free version) ----
  async function catalogReviews(voters = [], customers = []) {
    let ri = 0
    for (const rv of catalog.reviews) {
      const book = books[rv.book]
      const k = hashStr(rv.name + rv.text + rv.book)
      const helpful = voters.filter((_, j) => (k >> j) % 5 === 0).slice(0, 6)
      await store.insert('reviews', { book: String(book._id), name: rv.name, rating: rv.rating, text: rv.text, spoiler: k % 23 === 0, helpful, reports: 0, createdAt: at(rv.daysAgo), ...(customers.length && ri++ === 7 ? { reports: 2, reporters: [String(customers[1]._id), String(customers[2]._id)], lastReport: 'Contains personal remarks' } : {}) })
    }
  }
  async function refreshAllRatings() {
    const allRev = await store.find('reviews', {})
    for (const b of books) {
      const rs = allRev.filter((x) => String(x.book) === String(b._id))
      await store.update('books', b._id, rs.length ? { numReviews: rs.length, rating: Math.round((rs.reduce((s, x) => s + x.rating, 0) / rs.length) * 10) / 10 } : { numReviews: 0, rating: 0 })
    }
  }

  if (!people) {
    await catalogReviews()
    await refreshAllRatings()
    return { books: books.length, users: 0, orders: 0, bundles: bundles.length }
  }
  let voters

  // ---- users ----
  const hash = await ctx.hash(SAMPLE_PASSWORD)
  const names = ['Amelia Hart', 'Rohan Mehta', 'Lena Fischer', 'Marco Silva', 'Yuki Tanaka', 'Grace Mwangi', 'Noah Fraser', 'Ines Duarte']
  const mk = (name, email, role, extra = {}) => store.insert('users', { name, email, password: hash, role, tokenVersion: 0, points: 0, lifetimePoints: 0, country: 'US', readingList: [], goal: null, createdAt: at(220 - Math.floor(r() * 60)), ...extra })
  const demo = await mk('Demo Reader', 'user@example.com', 'user', { readingList: [] })
  const staff = await mk('Sam Staff', 'staff@example.com', 'staff')
  await mk('Ada Admin', 'admin@example.com', 'admin')
  const customers = []
  for (const nm of names) customers.push(await mk(nm, `${nm.toLowerCase().replace(/ /g, '.')}@example.com`, 'user', { country: ['US', 'US', 'GB', 'DE', 'CA', 'IN', 'US', 'AU'][customers.length] }))
  const everyone = [demo, ...customers]
  voters = everyone.map((u) => String(u._id))

  for (const e of await store.find('events', {})) {
    const going = new Date(e.startsAt).getTime() > nowMs ? voters.slice(0, 2 + (hashStr(e.title) % 4)) : voters.slice(0, 5)
    await store.update('events', e._id, { rsvps: going })
  }

  // ---- orders ----
  const ledger = []
  const userPoints = new Map()
  const orders = []
  async function order(user, daysAgo, picks, { status, gift, tax = true, country, extra } = {}) {
    const lines = picks.map(([title, format, qty = 1]) => {
      const b = B(title)
      const f = b.formats.find((x) => x.type === format)
      return { kind: 'book', book: String(b._id), title: b.title, format, price: f.price, qty }
    })
    const c = country || user.country || 'US'
    const t = computeTotals(lines, {}, { giftWrap: !!gift, method: 'standard', country: c, tier: tierFor(userPoints.get(String(user._id))?.lifetime || 0, settings), now: new Date(at(daysAgo)) }, settings)
    const physical = lines.some((l) => isPhysical(l.format))
    const st = status || (daysAgo > 14 ? 'delivered' : daysAgo > 6 ? 'shipped' : daysAgo > 2 ? 'processing' : 'placed')
    const finalStatus = !physical ? 'delivered' : st
    const placed = at(daysAgo, Math.floor(r() * 40000))
    const doc = await store.insert('orders', {
      user: String(user._id),
      items: lines.map((l) => ({ kind: 'book', book: l.book, title: l.title, format: l.format, price: l.price, qty: l.qty })),
      subtotal: t.subtotal, bundleDiscount: 0, discount: 0, pointsUsed: 0, pointsDiscount: 0, giftCardApplied: 0,
      shippingCost: t.shipping, shippingMethod: physical ? 'standard' : undefined, giftWrap: t.giftWrap, ...(gift ? { gift: { wrap: true, message: gift } } : {}),
      tax: tax ? t.tax : 0, total: t.total, amountDue: t.total, pointsEarned: t.pointsEarned,
      shipping: { name: user.name, address: '12 Quill Lane', city: 'Bookford', postalCode: '10001', country: c },
      paymentStatus: `paid (${ctx.payments?.label || 'mock'})`, status: finalStatus, fulfilled: true,
      ...(finalStatus === 'delivered' ? { deliveredAt: new Date(new Date(placed).getTime() + 3 * DAY).toISOString() } : {}),
      createdAt: placed, updatedAt: placed, ...(extra || {}),
    })
    orders.push(doc)
    const up = userPoints.get(String(user._id)) || { lifetime: 0 }
    up.lifetime += t.pointsEarned
    userPoints.set(String(user._id), up)
    ledger.push({ user: String(user._id), delta: t.pointsEarned, type: 'earn', order: String(doc._id), note: `Order #${shortId(doc._id)}`, createdAt: placed })
    return doc
  }
  const pop = books.filter((b) => !b.series || true).filter((b) => new Date(b.publishedAt) < new Date(nowMs))
  const FORMAT_MIX = ['paperback', 'paperback', 'paperback', 'paperback', 'paperback', 'paperback', 'hardcover', 'ebook', 'ebook', 'audiobook']
  const pickFormat = (b) => {
    const f = FORMAT_MIX[Math.floor(r() * FORMAT_MIX.length)]
    return b.formats.some((x) => x.type === f) ? f : 'paperback'
  }
  // the demo reader's story first, so loyalty tiers and the library look lived-in
  await order(demo, 150, [['Pride and Prejudice', 'ebook'], ['Jane Eyre', 'ebook']])
  await order(demo, 118, [['The Lantern of Orrin Vale', 'paperback'], ['Crown of Salt and Thorn', 'hardcover']])
  await order(demo, 84, [["Alice's Adventures in Wonderland", 'audiobook'], ['Moby-Dick; or, The Whale', 'ebook']])
  await order(demo, 52, [['Letters to the Lighthouse Keeper', 'paperback'], ['The Spring We Almost Missed', 'paperback'], ['Second Chances at Maple Row', 'hardcover']], { gift: 'For your birthday. Happy reading!' })
  const returned = await order(demo, 25, [['Salt, Ink, Ash', 'paperback'], ['Small Hours', 'paperback']])
  await order(demo, 8, [['Orbit of Quiet Machines', 'hardcover'], ['Murder at Lantern Pier', 'paperback']], { status: 'shipped' })
  const pre = B('The Glass Cartographer')
  await order(demo, 2, [['The Glass Cartographer', 'hardcover']], { status: 'preorder' })
  void pre
  const buyers = customers
  for (let i = 0; i < 64; i++) {
    const user = buyers[Math.floor(r() * buyers.length)]
    const age = Math.floor(Math.pow(r(), 1.25) * 90) + 1
    const n2 = 1 + Math.floor(r() * 3)
    const used = new Set()
    const picks = []
    for (let k = 0; k < n2; k++) {
      const b = pop[Math.floor(r() * pop.length)]
      if (used.has(b.title)) continue
      used.add(b.title)
      picks.push([b.title, pickFormat(b), 1 + (r() < 0.2 ? 1 : 0)])
    }
    const cancelled = age > 10 && r() < 0.06
    await order(user, age, picks.map(([t, f, q]) => [t, f, f === 'ebook' || f === 'audiobook' ? 1 : q]), cancelled ? { status: 'cancelled' } : {})
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  userPoints.get(String(demo._id)).lifetime += 450
  for (const [uid, v] of userPoints) {
    const u = everyone.find((x) => String(x._id) === uid)
    if (!u) continue
    await store.update('users', u._id, { points: v.lifetime - (u === demo ? 120 : 0), lifetimePoints: v.lifetime })
  }
  ledger.push({ user: String(demo._id), delta: 450, type: 'adjust', order: '', note: 'Bonus: Folio Reading Challenge', createdAt: at(70) })
  ledger.push({ user: String(demo._id), delta: -120, type: 'redeem', order: '', note: 'Redeemed at checkout', createdAt: at(52) })
  for (const l of ledger) await store.insert('pointsLedger', l)

  // ---- returns ----
  const returnedOrder = await store.get('orders', returned._id)
  await store.insert('returns', { order: String(returnedOrder._id), user: String(demo._id), items: [{ book: String(B('Small Hours')._id), title: 'Small Hours', format: 'paperback', qty: 1, price: B('Small Hours').formats[0].price }], reason: 'damaged', note: 'The cover arrived creased.', status: 'requested', amount: round2(B('Small Hours').formats[0].price * 1.07), history: [{ status: 'requested', at: at(4), by: demo.name, note: 'The cover arrived creased.' }], createdAt: at(4) })
  const other = orders.find((o) => String(o.user) === String(customers[0]._id) && o.status === 'delivered' && o.items.some((i) => isPhysical(i.format)))
  if (other) {
    const it = other.items.find((i) => isPhysical(i.format))
    await store.insert('returns', { order: String(other._id), user: String(customers[0]._id), items: [{ book: it.book, title: it.title, format: it.format, qty: 1, price: it.price }], reason: 'changed-mind', note: '', status: 'approved', amount: round2(it.price * 1.07), history: [{ status: 'requested', at: at(9), by: customers[0].name }, { status: 'approved', at: at(8), by: staff.name, note: 'Send it back in the original packaging.' }], createdAt: at(9) })
  }

  // ---- reviews (with helpful votes, a few spoilers and reported ones) ----

  await catalogReviews(voters, customers)
  const mineReviews = [
    ['Pride and Prejudice', 5, 'Sharper and funnier than I remembered. The first chapter alone is a masterclass in dry wit.', false],
    ['Letters to the Lighthouse Keeper', 4, 'Gentle and well paced. The letters about the winter storm are the best part.', false],
    ['Crown of Salt and Thorn', 4, 'The twist with the second heir caught me completely off guard (spoilers inside).', true],
  ]
  for (const [t, rating, text, spoiler] of mineReviews) await store.insert('reviews', { book: String(B(t)._id), user: String(demo._id), name: demo.name, rating, text, spoiler, helpful: [String(customers[0]._id), String(customers[3]._id)], reports: 0, createdAt: at(30 + Math.floor(r() * 50)) })
  await refreshAllRatings()
  // classics get a few ratings so they are not blank
  for (const b of classicsList) {
    const ratings = [5, 5, 4, 5, 4].slice(0, 3 + (hashStr(b.title) % 3))
    for (let j = 0; j < ratings.length; j++) await store.insert('reviews', { book: String(b._id), name: ['Aisha K.', 'Daniel R.', 'Meera S.', 'Tom B.', 'Sofia L.'][j], rating: ratings[j], text: ['A classic for a reason.', 'Reads far more freshly than I expected.', 'Worth rereading every few years.', 'Lovely edition and easy to read on the phone.', 'The opening chapters are unbeatable.'][j], spoiler: false, helpful: [], reports: 0, createdAt: at(20 + j * 9 + (hashStr(b.title) % 20)) })
    const rs = await store.find('reviews', { book: String(b._id) })
    await store.update('books', b._id, { numReviews: rs.length, rating: Math.round((rs.reduce((s, x) => s + x.rating, 0) / rs.length) * 10) / 10 })
  }

  // ---- Q&A ----
  const qa = [
    ['Orbit of Quiet Machines', 'Is this the first book in the series, and can I read it on its own?', [[staff, 'It is the first Kepler Road book and works well as a standalone.']]],
    ['Pride and Prejudice', 'Does the e-book include the whole novel?', [[staff, 'The e-book edition here includes sample chapters for the live preview; a full edition is delivered in a live store.'], [customers[2], 'I bought the paperback and it is the complete text.']]],
    ['The Ninth Guest', 'Is it very gory? I prefer cosy mysteries.', [[customers[1], 'Not at all: it is a classic puzzle in a dining room, no graphic scenes.']]],
    ["The Cartographer's Dragon", 'Does the hardcover include the fold-out map?', [[staff, 'Yes, the collector hardcover has a fold-out map printed on the endpapers.']]],
    ['Monsoon Hearts', 'Is the audiobook narrated by a single voice?', []],
    ['Pragmatic APIs', 'Are the examples in a specific language?', [[customers[3], 'Mostly HTTP and JSON with a few snippets in JavaScript.']]],
    ['Jane Eyre', 'Which translation or edition is this based on?', [[staff, 'It is the 1847 text as published in the public domain.']]],
    ['Why Stars Twinkle', 'Is it suitable for a ten year old?', []],
  ]
  for (const [title, q, answers] of qa) {
    const asker = customers[hashStr(q) % customers.length]
    await store.insert('questions', { book: String(B(title)._id), user: String(asker._id), name: asker.name, text: q, answers: answers.map(([u, text], j) => ({ _id: ctx.newId(), user: String(u._id), name: u.name, role: u.role, text, createdAt: at(10 - j) })), createdAt: at(12) })
  }

  // ---- follows, reading list, goal, activity ----
  for (const a of ['Idris Wolfe', 'Harriet Lowell', 'Jane Austen']) await store.insert('follows', { user: String(demo._id), author: slugify(a), name: a, createdAt: at(40) })
  for (const [u, a] of [[customers[0], 'Idris Wolfe'], [customers[1], 'Idris Wolfe'], [customers[2], 'Harriet Lowell'], [customers[3], 'Maren Ashdown']]) await store.insert('follows', { user: String(u._id), author: slugify(a), name: a, createdAt: at(30) })
  const year = new Date(nowMs).getUTCFullYear()
  const yStart = new Date(`${year}-01-01T00:00:00Z`).getTime()
  const finishedTitles = ['Pride and Prejudice', 'Letters to the Lighthouse Keeper', 'The Hidden Life of Tide Pools', 'The Lantern of Orrin Vale', 'The Clockmaker\'s Alibi', 'Alice\'s Adventures in Wonderland', 'Salt, Ink, Ash', 'Why Stars Twinkle', 'The Spring We Almost Missed', 'The Tidewater Protocol', 'Forest Under Our Feet', 'Winter at Ravenscar Hall']
  const readingList = []
  const doneTitles = finishedTitles.filter((t) => byTitle.has(t))
  doneTitles.forEach((t, i) => {
    const b = byTitle.get(t)
    const when = yStart + ((nowMs - yStart) * (i + 0.6)) / (doneTitles.length + 0.7)
    readingList.push({ book: String(b._id), status: 'finished', addedAt: new Date(when - 12 * DAY).toISOString(), startedAt: new Date(when - 9 * DAY).toISOString(), finishedAt: new Date(when).toISOString() })
  })
  readingList.push({ book: String(B('Orbit of Quiet Machines')._id), status: 'reading', addedAt: at(9), startedAt: at(6) })
  readingList.push({ book: String(B('Moby-Dick; or, The Whale')._id), status: 'reading', addedAt: at(20), startedAt: at(14) })
  for (const t of ['Crown of Salt and Thorn', 'Ember Court', 'Les Jardins de Mars', 'Jane Eyre']) if (byTitle.has(t)) readingList.push({ book: String(B(t)._id), status: 'want', addedAt: at(3 + readingList.length) })
  const shareToken = ctx.newId() + 'a1b2c3d4'
  await store.update('users', demo._id, { readingList, goal: { year, books: 18 }, country: 'US', wishlistToken: shareToken })
  const today = ctx.now().slice(0, 10)
  const dayOf = (n) => new Date(nowMs - n * DAY).toISOString().slice(0, 10)
  for (let d = 0; d < 84; d++) {
    const streak = d < 9
    if (streak || r() < 0.38) await store.insert('activity', { user: String(demo._id), date: dayOf(d), minutes: streak ? 18 + Math.floor(r() * 40) : 5 + Math.floor(r() * 50), pages: 10 + Math.floor(r() * 40) })
  }
  void today

  // reader state for Pride and Prejudice
  const pp = B('Pride and Prejudice')
  const ch = chaptersFor({ slug: 'pride-and-prejudice', title: pp.title, author: pp.author, genre: pp.genre }, classics)
  const p0 = ch[0].paragraphs[0]
  const hStart = p0.indexOf('a single man')
  await store.insert('readerStates', {
    user: String(demo._id), book: String(pp._id), updatedAt: at(1),
    progress: { chapter: 1, para: 6, pct: 38 },
    bookmarks: [{ id: ctx.newId(), chapter: 0, para: 8, label: 'Mrs Bennet and the new neighbour', createdAt: at(3) }],
    highlights: [{ id: ctx.newId(), chapter: 0, para: 0, start: hStart, end: hStart + 'a single man in possession of a good fortune'.length, text: 'a single man in possession of a good fortune', note: 'The most famous opening line in English fiction.', color: 'yellow', createdAt: at(3) }],
  })

  // ---- clubs ----
  const clubDefs = [
    { name: 'Midnight Mystery Society', description: 'Whodunits, locked rooms and stopped clocks. Spoiler tags are sacred.', owner: customers[1], pick: 'The Ninth Guest', members: [customers[1], customers[2], customers[4], demo], note: 'Eight invitations were sent. Nine people sat down to dinner. Who is the ninth?' },
    { name: 'Slow Burn Romance', description: 'Patient love stories, rainy afternoons and annotated tea stains.', owner: customers[3], pick: 'Letters to the Lighthouse Keeper', members: [customers[3], customers[0], customers[5]], note: 'This month: the letters. Bring your favourite line.' },
    { name: 'Worlds Beyond', description: 'Science fiction and fantasy for readers who like to think about the ending afterwards.', owner: customers[0], pick: 'Orbit of Quiet Machines', members: [customers[0], customers[6], customers[7], demo], note: 'Discussion in two weeks. No spoilers beyond chapter 10 until then.' },
    { name: 'Classics Corner', description: 'One public-domain classic a month, read slowly and argued about kindly.', owner: demo, pick: 'Jane Eyre', members: [demo, customers[2], customers[5], customers[7]], note: 'The first three chapters are free to read in the in-browser reader.' },
  ]
  for (const [ci, c] of clubDefs.entries()) {
    const club = await store.insert('clubs', {
      name: c.name, nameKey: c.name.toLowerCase(), description: c.description, owner: String(c.owner._id), ownerName: c.owner.name, members: c.members.map((u) => String(u._id)),
      pick: { book: String(B(c.pick)._id), month: ctx.now().slice(0, 7), note: c.note, discussAt: new Date(nowMs + (10 + ci * 3) * DAY).toISOString() },
      history: [{ book: String(B(['The Clockmaker\'s Alibi', 'The Spring We Almost Missed', 'The Tidewater Protocol', 'Pride and Prejudice'][ci])._id), month: new Date(nowMs - 35 * DAY).toISOString().slice(0, 7), note: '', discussAt: null }],
      createdAt: at(90),
    })
    const threads = [
      [`First impressions of ${c.pick}`, [[0, 'Just started it. The opening has real atmosphere and I am already suspicious of everyone.'], [1, 'Same here! I am only on chapter two, so no spoilers please.'], [2, 'The pacing is lovely so far. Reading it in the evenings, a few chapters at a time.']]],
      ['What are you all reading alongside it?', [[0, 'A poetry collection between chapters, it works well as a palate cleanser.'], [1, 'Rereading an old favourite. Recommendations welcome.']]],
    ]
    for (const [ti, [title, posts]] of threads.entries()) {
      const t = await store.insert('threads', { club: String(club._id), title, authorName: c.members[0].name, author: String(c.members[0]._id), posts: posts.length, lastPostAt: at(2 - ti * 0.5), createdAt: at(4 + ti) })
      for (const [pj, [who, body]] of posts.entries()) {
        const u = c.members[who % c.members.length]
        await store.insert('posts', { thread: String(t._id), club: String(club._id), user: String(u._id), name: u.name, body, spoiler: false, createdAt: at(4 - pj * 0.4 - ti * 0.3) })
      }
    }
  }

  // ---- notifications, gift card, alerts, coupons, stock moves ----
  const notes = [
    ['order', 'Order shipped', 'Your order with Orbit of Quiet Machines is on its way.', '/orders', 6],
    ['event', 'Idris Wolfe is hosting an event', 'Maps and Dragons: an online Q&A', '/events', 3],
    ['new-book', 'Coming soon from Idris Wolfe', 'The Glass Cartographer', '/books', 2],
    ['club', 'Worlds Beyond: new monthly pick', 'Orbit of Quiet Machines', '/clubs', 1],
  ]
  for (const [type, title, body, link, d] of notes) await store.insert('notifications', { user: String(demo._id), type, title, body, link, read: d > 4, createdAt: at(d) })
  await store.insert('giftcards', { code: SAMPLE_GIFT_CODE, balance: 25, initial: 25, purchaser: String(customers[0]._id), toName: 'Demo Reader', toEmail: 'user@example.com', message: 'Happy reading!', createdAt: at(10) })
  await store.insert('stockAlerts', { user: String(demo._id), book: String(B('The Lantern of Orrin Vale')._id), format: 'hardcover', createdAt: at(2) })
  for (const b of books.slice(0, 3)) await store.insert('stockMoves', { book: String(b._id), format: 'paperback', from: b.stock - 20, to: b.stock, by: String(staff._id), reason: 'Delivery from the publisher', createdAt: at(6) })

  return { books: books.length, users: everyone.length + 2, orders: orders.length, bundles: bundles.length }
}

