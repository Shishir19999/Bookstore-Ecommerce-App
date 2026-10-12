// Shopping routes: quote, checkout, orders, returns, gift cards, loyalty and coupons (shopper side).
import { route, HttpError, fail, str, text, int, notify, getSettings, publicUser, sortBy } from './framework.mjs'
import { 
  FORMATS, isPhysical, isDigital, computeTotals, evalCoupon, tierFor, defaultFormat, findFormat, deriveBook, isUpcoming, canBuy, round2, returnEligibility, shortId, isStaff, GIFT_CODE_RE, COUNTRIES, slugify,
 } from './rules.mjs'
import { getBooks, nowOf, ownedFormats } from './m-catalog.mjs'

const isId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{2,40}$/.test(s)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const makeCode = (rand) => Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('')).join('-')
export const newGiftCode = (ctx) => makeCode(ctx.random || Math.random)

const pending = (o) => /^(pending|expired)/.test(o.paymentStatus || '')
const cleanAddress = (s, defCountry) => {
  const pick = (k, max) => (s && typeof s[k] === 'string' ? s[k].trim().slice(0, max) : '')
  const out = { name: pick('name', 80), address: pick('address', 200), city: pick('city', 80), postalCode: pick('postalCode', 20), country: (pick('country', 2) || defCountry).toUpperCase() }
  return out
}

// ---------- cart resolution ----------
async function resolveCart(ctx, items, user, settings) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) fail(400, 'items must be a non-empty array (max 50)')
  const now = nowOf(ctx)
  const books = await getBooks(ctx)
  const byId = new Map(books.map((b) => [String(b._id), b]))
  const merged = new Map()
  const cards = []
  for (const it of items) {
    if (it && it.giftCard) {
      const g = it.giftCard
      const amount = Number(g.amount)
      const { min, max } = settings.giftCards
      if (!Number.isFinite(amount) || amount < min || amount > max) fail(400, `Gift card amount must be between $${min} and $${max}`)
      if (cards.length >= 5) fail(400, 'You can buy up to 5 gift cards per order')
      const email = typeof g.toEmail === 'string' ? g.toEmail.trim().toLowerCase().slice(0, 120) : ''
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid recipient email for the gift card')
      cards.push({ kind: 'giftcard', title: 'Gift card', price: round2(amount), qty: 1, toName: str(g.toName).slice(0, 80), toEmail: email, message: str(g.message).slice(0, 300) })
      continue
    }
    const id = it?.book
    const qty = it?.qty
    if (!isId(id)) fail(400, 'Invalid book id in items')
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) fail(400, 'qty must be an integer between 1 and 20')
    const book = byId.get(String(id))
    if (!book) fail(400, 'One or more books no longer exist')
    if (it.format !== undefined && !FORMATS.includes(it.format)) fail(400, `format must be one of: ${FORMATS.join(', ')}`)
    const format = it.format || defaultFormat(book).type
    const f = findFormat(book, format)
    if (!f) fail(400, `"${book.title}" is not available as ${format}`)
    const bundle = isId(it.bundle) ? String(it.bundle) : ''
    const key = `${id}|${format}|${bundle}`
    const prev = merged.get(key)
    merged.set(key, { book, f, format, bundle, qty: Math.min((prev?.qty || 0) + (isDigital(format) ? 1 : qty), isDigital(format) ? 1 : 20) })
  }
  const lines = []
  const owned = user ? new Map() : null
  for (const m of merged.values()) {
    const { book, f, format } = m
    const upcoming = isUpcoming(book, now)
    if (isDigital(format) && user) {
      if (!owned.has(String(book._id))) owned.set(String(book._id), await ownedFormats(ctx, user._id, book._id))
      if (owned.get(String(book._id)).includes(format)) fail(409, `You already own the ${format === 'ebook' ? 'e-book' : 'audiobook'} of "${book.title}"`)
    }
    if (isPhysical(format)) {
      if (f.stock < m.qty) fail(409, f.stock > 0 ? `Only ${f.stock} cop${f.stock === 1 ? 'y' : 'ies'} of "${book.title}" left` : `"${book.title}" is out of stock`)
    } else if (!canBuy(book, format, now)) fail(409, `"${book.title}" is not available`)
    lines.push({ kind: 'book', book: String(book._id), title: book.title, author: book.author, image: book.image, format, price: round2(f.price), qty: m.qty, ...(m.bundle ? { bundle: m.bundle } : {}), ...(upcoming ? { preorder: true } : {}) })
  }
  return { lines: [...lines, ...cards], books: byId }
}

async function lookupCoupon(ctx, code) {
  if (code === undefined || code === null || code === '') return null
  if (typeof code !== 'string' || code.length > 30) fail(400, 'Invalid coupon code')
  return (await ctx.store.one('coupons', { code: code.trim().toUpperCase() })) || { __missing: true }
}

async function buildQuote(ctx, user, body) {
  const settings = await getSettings(ctx)
  const { lines, books } = await resolveCart(ctx, body.items, user, settings)
  const bundleIds = [...new Set(lines.map((l) => l.bundle).filter(Boolean))]
  const bundles = {}
  for (const id of bundleIds) {
    const b = await ctx.store.get('bundles', id)
    if (b) bundles[id] = { title: b.title, discountPct: b.discountPct, bookIds: b.bookIds.map(String) }
  }
  for (const l of lines) if (l.bundle && !bundles[l.bundle]) delete l.bundle
  let coupon = await lookupCoupon(ctx, body.couponCode)
  if (coupon?.__missing) coupon = { active: false }
  const tier = tierFor(user.lifetimePoints || 0, settings)
  const country = str(body.shipping?.country).toUpperCase() || user.country || settings.shipping.homeCountry
  if (!settings.tax[country]) fail(400, 'We do not ship to that country yet')
  const method = body.method === 'express' ? 'express' : 'standard'
  let card = null
  if (body.giftCardCode) {
    const code = str(body.giftCardCode).toUpperCase()
    card = GIFT_CODE_RE.test(code) ? await ctx.store.one('giftcards', { code }) : null
    if (!card || card.disabled || card.balance <= 0) fail(400, 'That gift card is invalid or has no balance')
  }
  const giftMessage = text(body, 'giftMessage', { max: 200 }) || ''
  const totals = computeTotals(lines, bundles, { coupon, pointsToRedeem: Number(body.points) || 0, pointsBalance: user.points || 0, giftWrap: !!body.giftWrap, method, country, tier, giftCardBalance: card?.balance || 0, now: nowOf(ctx) }, settings)
  if (totals.error) fail(400, totals.error)
  return { settings, lines, books, bundles, coupon: coupon && coupon.code ? coupon : null, tier, country, method, card, giftMessage, totals }
}

const lineView = (l) => ({ ...l })
route('POST', '/api/checkout/quote', 'user', async ({ ctx, body, user }) => {
  const q = await buildQuote(ctx, user, body)
  return { lines: q.lines.map(lineView), totals: q.totals, tier: q.tier, country: q.country, method: q.method, giftCard: q.card ? { code: q.card.code, balance: q.card.balance } : null, points: user.points || 0 }
})

// Legacy coupon check used by the cart page.
route('POST', '/api/coupons/validate', 'user', async ({ ctx, body, user }) => {
  if (typeof body.code !== 'string' || !body.code.trim()) fail(400, 'Enter a coupon code')
  const q = await buildQuote(ctx, user, { items: body.items })
  const coupon = await lookupCoupon(ctx, body.code)
  const r = evalCoupon(coupon?.__missing ? null : coupon, round2(q.totals.goods - q.totals.bundleDiscount), nowOf(ctx))
  if (!r.ok) fail(400, r.message)
  return { message: r.message, discount: r.discount, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description } }
})

// ---------- placing an order ----------
async function ensureFormats(ctx, raw) {
  if (Array.isArray(raw.formats) && raw.formats.length) return raw
  const d = deriveBook({ slug: slugify(raw.title), ...raw })
  return ctx.store.update('books', raw._id, { formats: d.formats, price: d.price, stock: d.stock })
}

async function rollback(ctx, st) {
  for (const r of st.reserved) {
    const b = await ctx.store.get('books', r.book)
    if (!b) continue
    const i = (b.formats || []).findIndex((f) => f.type === r.format)
    if (i >= 0 && isPhysical(r.format)) await ctx.store.atomic('books', { _id: b._id }, { $inc: { [`formats.${i}.stock`]: r.qty, stock: r.qty, sold: -r.qty } })
    else await ctx.store.atomic('books', { _id: b._id }, { $inc: { sold: -r.qty } })
  }
  if (st.coupon) await ctx.store.atomic('coupons', { _id: st.coupon._id, used: { $gt: 0 } }, { $inc: { used: -1 } })
  if (st.card) await ctx.store.atomic('giftcards', { _id: st.card._id }, { $inc: { balance: st.cardApplied } })
  if (st.points) await ctx.store.atomic('users', { _id: st.user._id }, { $inc: { points: st.points } })
}

async function reserve(ctx, q, user, orderTag) {
  const st = { reserved: [], coupon: null, card: null, cardApplied: 0, points: 0, user, orderTag }
  try {
    for (const l of q.lines) {
      if (l.kind === 'giftcard') continue
      const raw = await ensureFormats(ctx, await ctx.store.get('books', l.book))
      const i = raw.formats.findIndex((f) => f.type === l.format)
      let ok
      if (isPhysical(l.format)) ok = await ctx.store.atomic('books', { _id: raw._id, [`formats.${i}.type`]: l.format, [`formats.${i}.stock`]: { $gte: l.qty } }, { $inc: { [`formats.${i}.stock`]: -l.qty, stock: -l.qty, sold: l.qty } })
      else ok = await ctx.store.atomic('books', { _id: raw._id }, { $inc: { sold: l.qty } })
      if (!ok) fail(409, `"${l.title}" is no longer available in that quantity`)
      st.reserved.push({ book: l.book, format: l.format, qty: l.qty })
    }
    if (q.coupon) {
      const filter = q.coupon.usageLimit ? { _id: q.coupon._id, used: { $lt: q.coupon.usageLimit } } : { _id: q.coupon._id }
      if (!(await ctx.store.atomic('coupons', filter, { $inc: { used: 1 } }))) fail(400, 'This coupon has been fully redeemed')
      st.coupon = q.coupon
    }
    if (q.card && q.totals.giftCardApplied > 0) {
      if (!(await ctx.store.atomic('giftcards', { _id: q.card._id, balance: { $gte: q.totals.giftCardApplied } }, { $inc: { balance: -q.totals.giftCardApplied } }))) fail(409, 'The gift card balance changed, please try again')
      st.card = q.card
      st.cardApplied = q.totals.giftCardApplied
    }
    if (q.totals.pointsUsed > 0) {
      if (!(await ctx.store.atomic('users', { _id: user._id, points: { $gte: q.totals.pointsUsed } }, { $inc: { points: -q.totals.pointsUsed } }))) fail(409, 'Not enough reward points')
      st.points = q.totals.pointsUsed
    }
  } catch (e) {
    await rollback(ctx, st)
    throw e
  }
  return st
}

// Awards points, issues purchased gift cards and sends confirmations once an order is paid.
export async function fulfilPaid(ctx, order) {
  const settings = await getSettings(ctx)
  const items = order.items.map((i) => ({ ...i }))
  const issued = []
  for (const it of items) {
    if (it.kind !== 'giftcard' || it.code) continue
    let code
    do code = newGiftCode(ctx)
    while (await ctx.store.one('giftcards', { code }))
    await ctx.store.insert('giftcards', { code, balance: it.price, initial: it.price, purchaser: String(order.user), toName: it.toName || '', toEmail: it.toEmail || '', message: it.message || '', order: String(order._id), createdAt: ctx.now() })
    it.code = code
    issued.push(it)
    if (it.toEmail) {
      const rcpt = await ctx.store.one('users', { email: it.toEmail })
      if (rcpt) await notify(ctx, rcpt._id, { type: 'giftcard', title: 'You received a gift card', body: `A $${it.price.toFixed(2)} Folio Books gift card is waiting in your account.`, link: '/account' })
    }
  }
  const user = await ctx.store.get('users', order.user)
  if (order.pointsEarned > 0 && user) {
    const before = tierFor(user.lifetimePoints || 0, settings).id
    await ctx.store.atomic('users', { _id: user._id }, { $inc: { points: order.pointsEarned, lifetimePoints: order.pointsEarned } })
    await ctx.store.insert('pointsLedger', { user: String(user._id), delta: order.pointsEarned, type: 'earn', order: String(order._id), note: `Order #${shortId(order._id)}`, createdAt: ctx.now() })
    const after = tierFor((user.lifetimePoints || 0) + order.pointsEarned, settings)
    if (after.id !== before) await notify(ctx, user._id, { type: 'tier', title: `You reached ${after.name}`, body: after.freeShipping ? 'Standard shipping is now free on every order.' : `Earn ${Math.round(after.bonus * 100)}% bonus points on every order.`, link: '/account' })
  }
  await ctx.store.update('orders', order._id, { items, fulfilled: true })
  const digital = items.some((i) => i.kind !== 'giftcard' && isDigital(i.format))
  await notify(ctx, order.user, { type: 'order', title: `Order #${shortId(order._id)} confirmed`, body: digital ? 'Your digital purchases are ready in your library.' : 'We will let you know when it ships.', link: digital ? '/library' : '/orders' })
}

export async function placeOrder(ctx, user, body, { pendingPayment = false } = {}) {
  const q = await buildQuote(ctx, user, body)
  const orderTag = ctx.newId()
  const st = await reserve(ctx, q, user, orderTag)
  const t = q.totals
  const hasPhysical = q.lines.some((l) => l.kind !== 'giftcard' && isPhysical(l.format))
  const hasPre = q.lines.some((l) => l.preorder)
  const waitingForCard = pendingPayment && t.amountDue > 0
  const status = hasPre ? 'preorder' : hasPhysical || waitingForCard ? 'placed' : 'delivered'
  const now = ctx.now()
  let order
  try {
    const items = q.lines.map((l) => (l.kind === 'giftcard' ? { kind: 'giftcard', title: l.title, price: l.price, qty: 1, toName: l.toName, toEmail: l.toEmail, message: l.message } : { kind: 'book', book: l.book, title: l.title, format: l.format, price: l.price, qty: l.qty, ...(l.bundle ? { bundle: l.bundle } : {}), ...(l.preorder ? { preorder: true } : {}) }))
    order = await ctx.store.insert('orders', {
      user: String(user._id),
      items,
      subtotal: t.subtotal,
      bundleDiscount: t.bundleDiscount,
      discount: t.couponDiscount,
      couponCode: q.coupon?.code,
      pointsUsed: t.pointsUsed,
      pointsDiscount: t.pointsDiscount,
      giftCardCode: q.card?.code,
      giftCardApplied: t.giftCardApplied,
      shippingCost: t.shipping,
      shippingMethod: hasPhysical ? q.method : undefined,
      giftWrap: t.giftWrap,
      gift: t.giftWrap || q.giftMessage ? { wrap: t.giftWrap > 0, message: q.giftMessage } : undefined,
      tax: t.tax,
      total: t.total,
      amountDue: t.amountDue,
      pointsEarned: t.pointsEarned,
      shipping: hasPhysical ? cleanAddress(body.shipping, q.country) : { country: q.country },
      paymentStatus: waitingForCard ? 'pending (stripe)' : t.amountDue === 0 && t.giftCardApplied > 0 ? 'paid (gift card)' : `paid (${ctx.payments?.label || 'mock'})`,
      status,
      ...(status === 'delivered' ? { deliveredAt: now } : {}),
      createdAt: now,
      updatedAt: now,
    })
    if (st.points) await ctx.store.insert('pointsLedger', { user: String(user._id), delta: -st.points, type: 'redeem', order: String(order._id), note: `Order #${shortId(order._id)}`, createdAt: now })
    if (q.card) await ctx.store.insert('giftLedger', { card: String(q.card._id), delta: -st.cardApplied, order: String(order._id), createdAt: now })
  } catch (e) {
    await rollback(ctx, st)
    throw e
  }
  if (!waitingForCard) await fulfilPaid(ctx, order)
  return { order: await ctx.store.get('orders', order._id), q, st, waitingForCard }
}

// Restores everything an order consumed. Used for cancellation and expired Stripe sessions.
export async function reverseOrder(ctx, order, { reason = 'cancelled' } = {}) {
  for (const it of order.items) {
    if (it.kind === 'giftcard') continue
    const raw = await ctx.store.get('books', it.book)
    if (!raw || it.refunded) continue
    const i = (raw.formats || []).findIndex((f) => f.type === it.format)
    if (isPhysical(it.format) && i >= 0 && !it.restocked) await ctx.store.atomic('books', { _id: raw._id }, { $inc: { [`formats.${i}.stock`]: it.qty, stock: it.qty, sold: -it.qty } })
    else await ctx.store.atomic('books', { _id: raw._id }, { $inc: { sold: -it.qty } })
  }
  if (order.couponCode) await ctx.store.atomic('coupons', { code: order.couponCode, used: { $gt: 0 } }, { $inc: { used: -1 } })
  if (order.giftCardApplied > 0 && order.giftCardCode) await ctx.store.atomic('giftcards', { code: order.giftCardCode }, { $inc: { balance: order.giftCardApplied } })
  const u = await ctx.store.get('users', order.user)
  if (u) {
    const give = order.pointsUsed || 0
    const take = order.fulfilled ? Math.min(order.pointsEarned || 0, u.points || 0) : 0
    if (give || take) {
      await ctx.store.atomic('users', { _id: u._id }, { $inc: { points: give - take, lifetimePoints: -(order.fulfilled ? order.pointsEarned || 0 : 0) } })
      await ctx.store.insert('pointsLedger', { user: String(u._id), delta: give - take, type: 'adjust', order: String(order._id), note: `Order #${shortId(order._id)} ${reason}`, createdAt: ctx.now() })
    }
  }
  for (const it of order.items) if (it.kind === 'giftcard' && it.code) await ctx.store.atomic('giftcards', { code: it.code }, { $set: { disabled: true } })
}

export async function giftCardsUsed(ctx, order) {
  for (const it of order.items) {
    if (it.kind !== 'giftcard' || !it.code) continue
    const c = await ctx.store.one('giftcards', { code: it.code })
    if (c && c.balance < c.initial) return true
  }
  return false
}

// ---------- checkout routes ----------
route('POST', '/api/orders', 'user', async ({ ctx, body, user }) => {
  if (ctx.payments?.mode() === 'stripe') fail(403, 'Mock orders are disabled; use /api/payments/checkout')
  const { order } = await placeOrder(ctx, user, body)
  return [201, order]
})

route('GET', '/api/payments/config', null, async ({ ctx }) => ({ mode: ctx.payments?.mode() || 'mock' }))

route('POST', '/api/payments/checkout', 'user', async ({ ctx, body, user }) => {
  const stripe = ctx.payments?.mode() === 'stripe'
  const { order, q, st, waitingForCard } = await placeOrder(ctx, user, body, { pendingPayment: stripe })
  if (!waitingForCard) return [201, { mode: 'mock', order }]
  try {
    const session = await ctx.payments.createSession({ order, lines: q.lines, totals: q.totals, user })
    await ctx.store.update('orders', order._id, { stripeSessionId: session.id })
    return [201, { mode: 'stripe', url: session.url, orderId: order._id }]
  } catch (e) {
    await ctx.store.remove('orders', order._id)
    await ctx.store.removeWhere('pointsLedger', { order: String(order._id) })
    await ctx.store.removeWhere('giftLedger', { order: String(order._id) })
    await rollback(ctx, st)
    throw e
  }
})

// Stripe webhook events (signature already verified by the adapter).
export async function stripeEvent(ctx, event) {
  const session = event.data?.object
  const orderId = session?.metadata?.orderId || session?.client_reference_id
  if (!orderId) return
  const order = await ctx.store.get('orders', orderId)
  if (!order) return
  if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
    if (order.paymentStatus !== 'pending (stripe)') return
    const digitalOnly = order.items.every((i) => i.kind === 'giftcard' || isDigital(i.format))
    await ctx.store.update('orders', order._id, { paymentStatus: 'paid (stripe)', ...(digitalOnly && order.status === 'placed' ? { status: 'delivered', deliveredAt: ctx.now() } : {}), updatedAt: ctx.now() })
    await fulfilPaid(ctx, await ctx.store.get('orders', order._id))
  } else if (event.type === 'checkout.session.expired' && order.paymentStatus === 'pending (stripe)') {
    await ctx.store.update('orders', order._id, { paymentStatus: 'expired (stripe)', status: 'cancelled', updatedAt: ctx.now() })
    await reverseOrder(ctx, order, { reason: 'expired' })
  }
}

// ---------- orders ----------
export async function settlePreorders(ctx) {
  const now = nowOf(ctx)
  const rows = await ctx.store.find('orders', { status: 'preorder' })
  if (!rows.length) return
  const books = new Map((await ctx.store.find('books', {})).map((b) => [String(b._id), b]))
  for (const o of rows) {
    const released = o.items.every((i) => i.kind === 'giftcard' || !books.get(String(i.book)) || !isUpcoming(books.get(String(i.book)), now))
    if (!released) continue
    const digitalOnly = o.items.every((i) => i.kind === 'giftcard' || isDigital(i.format))
    await ctx.store.update('orders', o._id, { status: digitalOnly ? 'delivered' : 'placed', ...(digitalOnly ? { deliveredAt: ctx.now() } : {}), updatedAt: ctx.now() })
    await notify(ctx, o.user, { type: 'order', title: 'Your pre-order has been released', body: `Order #${shortId(o._id)} is now ${digitalOnly ? 'in your library' : 'being prepared'}.`, link: digitalOnly ? '/library' : '/orders' })
  }
}

async function withExtras(ctx, orders, settings) {
  const rets = await ctx.store.find('returns', { order: { $in: orders.map((o) => String(o._id)) } })
  return orders.map((o) => {
    const mine = rets.filter((r) => String(r.order) === String(o._id))
    const eligibility = returnEligibility(o, settings, nowOf(ctx))
    return { ...o, returns: mine.map((r) => ({ _id: r._id, status: r.status, amount: r.amount })), returnable: eligibility.ok && o.items.some((i) => i.kind !== 'giftcard' && isPhysical(i.format)), returnDaysLeft: eligibility.daysLeft ?? 0, canCancel: ['placed', 'preorder'].includes(o.status) && !pending(o) }
  })
}

route('GET', '/api/orders/mine', 'user', async ({ ctx, user }) => {
  await settlePreorders(ctx)
  const rows = await ctx.store.find('orders', { user: String(user._id) }, { sort: { createdAt: -1 } })
  return withExtras(ctx, rows, await getSettings(ctx))
})

route('GET', '/api/orders/:id', 'user', async ({ ctx, params, user }) => {
  await settlePreorders(ctx)
  const o = isId(params.id) ? await ctx.store.get('orders', params.id) : null
  if (!o || (String(o.user) !== String(user._id) && !isStaff(user))) fail(404, 'Order not found')
  const [x] = await withExtras(ctx, [o], await getSettings(ctx))
  const buyer = await ctx.store.get('users', o.user)
  return { ...x, customer: buyer ? { _id: buyer._id, name: buyer.name, email: buyer.email } : null }
})

route('POST', '/api/orders/:id/reorder', 'user', async ({ ctx, params, user }) => {
  if (!isId(params.id)) fail(400, 'Invalid order id')
  const order = await ctx.store.one('orders', { _id: params.id, user: String(user._id) })
  if (!order) fail(404, 'Order not found')
  const books = new Map((await getBooks(ctx)).map((b) => [String(b._id), b]))
  const items = []
  const unavailable = []
  for (const it of order.items) {
    if (it.kind === 'giftcard') continue
    const b = books.get(String(it.book))
    const format = it.format || 'paperback'
    const f = b && findFormat(b, format)
    if (!b || !f || !canBuy(b, format, nowOf(ctx)) || (isPhysical(format) && f.stock < 1)) unavailable.push(it.title)
    else items.push({ _id: b._id, title: b.title, author: b.author, genre: b.genre, price: f.price, image: b.image, format, qty: isDigital(format) ? 1 : Math.min(it.qty, f.stock, 20) })
  }
  return { items, unavailable }
})

route('POST', '/api/orders/:id/cancel', 'user', async ({ ctx, params, user }) => {
  const order = isId(params.id) ? await ctx.store.one('orders', { _id: params.id, user: String(user._id) }) : null
  if (!order) fail(404, 'Order not found')
  if (!['placed', 'preorder'].includes(order.status) || pending(order)) fail(409, 'This order can no longer be cancelled; request a return after delivery instead')
  if (await giftCardsUsed(ctx, order)) fail(409, 'A gift card from this order has already been used')
  await ctx.store.update('orders', order._id, { status: 'cancelled', updatedAt: ctx.now() })
  await reverseOrder(ctx, order)
  return ctx.store.get('orders', order._id)
})

// ---------- returns ----------
const REASONS = ['damaged', 'wrong-item', 'not-as-described', 'changed-mind', 'other']
function refundFor(order, items) {
  const goods = order.items.filter((i) => i.kind !== 'giftcard').reduce((s, i) => s + i.price * i.qty, 0)
  const disc = (order.bundleDiscount || 0) + (order.discount || 0) + (order.pointsDiscount || 0)
  const ratio = goods > 0 ? Math.min(1, disc / goods) : 0
  const net = goods - disc
  const taxShare = net > 0 ? (order.tax || 0) / net : 0
  return round2(items.reduce((s, i) => s + i.price * i.qty * (1 - ratio) * (1 + taxShare), 0))
}

route('POST', '/api/orders/:id/returns', 'user', async ({ ctx, params, body, user }) => {
  const order = isId(params.id) ? await ctx.store.one('orders', { _id: params.id, user: String(user._id) }) : null
  if (!order) fail(404, 'Order not found')
  const settings = await getSettings(ctx)
  const elig = returnEligibility(order, settings, nowOf(ctx))
  if (!elig.ok) fail(409, elig.reason)
  if (!REASONS.includes(body.reason)) fail(400, `reason must be one of: ${REASONS.join(', ')}`)
  if (!Array.isArray(body.items) || !body.items.length) fail(400, 'Choose at least one item to return')
  const prior = (await ctx.store.find('returns', { order: String(order._id) })).filter((r) => r.status !== 'rejected' && r.status !== 'cancelled')
  const items = []
  for (const want of body.items) {
    const line = order.items.find((i) => i.kind !== 'giftcard' && String(i.book) === String(want.book) && (i.format || 'paperback') === (want.format || i.format || 'paperback'))
    if (!line) fail(400, 'One of the items is not part of this order')
    if (!isPhysical(line.format || 'paperback')) fail(400, 'Digital items cannot be returned')
    const used = prior.reduce((s, r) => s + r.items.filter((x) => String(x.book) === String(line.book) && x.format === line.format).reduce((n, x) => n + x.qty, 0), 0)
    const qty = int(want.qty, { min: 1, max: line.qty, label: 'quantity' })
    if (qty + used > line.qty) fail(409, `You can return at most ${line.qty - used} of "${line.title}"`)
    items.push({ book: String(line.book), title: line.title, format: line.format || 'paperback', qty, price: line.price })
  }
  const note = text(body, 'note', { max: 400 }) || ''
  const ret = await ctx.store.insert('returns', { order: String(order._id), user: String(user._id), items, reason: body.reason, note, status: 'requested', amount: refundFor(order, items), history: [{ status: 'requested', at: ctx.now(), by: user.name, note }], createdAt: ctx.now() })
  const staff = await ctx.store.find('users', { role: { $in: ['staff', 'admin'] } })
  await notify(ctx, staff.map((s) => s._id), { type: 'return', title: 'New return request', body: `Order #${shortId(order._id)} - ${items.map((i) => i.title).join(', ').slice(0, 100)}`, link: '/manage/returns' })
  return [201, ret]
})

route('GET', '/api/me/returns', 'user', async ({ ctx, user }) => ctx.store.find('returns', { user: String(user._id) }, { sort: { createdAt: -1 } }))

route('POST', '/api/me/returns/:id/cancel', 'user', async ({ ctx, params, user }) => {
  const r = await ctx.store.one('returns', { _id: params.id, user: String(user._id) })
  if (!r) fail(404, 'Return not found')
  if (r.status !== 'requested') fail(409, 'Only requests that have not been reviewed can be withdrawn')
  return ctx.store.update('returns', r._id, { status: 'cancelled', history: [...r.history, { status: 'cancelled', at: ctx.now(), by: user.name }] })
})

route('GET', '/api/staff/returns', 'staff', async ({ ctx, query }) => {
  const filter = query.status && query.status !== 'all' ? { status: String(query.status) } : {}
  const rows = await ctx.store.find('returns', filter, { sort: { createdAt: -1 } })
  const users = new Map((await ctx.store.find('users', {})).map((u) => [String(u._id), u]))
  return rows.map((r) => ({ ...r, customer: users.get(String(r.user)) ? { name: users.get(String(r.user)).name, email: users.get(String(r.user)).email } : null }))
})

const TRANSITIONS = { requested: ['approved', 'rejected'], approved: ['received', 'refunded', 'rejected'], received: ['refunded'] }
route('POST', '/api/staff/returns/:id/decision', 'staff', async ({ ctx, params, body, user }) => {
  const r = await ctx.store.get('returns', params.id)
  if (!r) fail(404, 'Return not found')
  const status = body.status
  if (!(TRANSITIONS[r.status] || []).includes(status)) fail(409, `A ${r.status} return cannot become ${status}`)
  const note = text(body, 'note', { max: 300 }) || ''
  let patch = { status, history: [...r.history, { status, at: ctx.now(), by: user.name, note }] }
  if (status === 'refunded') {
    const order = await ctx.store.get('orders', r.order)
    const restock = body.restock !== false
    const items = order.items.map((it) => {
      const hit = r.items.find((x) => String(x.book) === String(it.book) && x.format === it.format)
      return hit ? { ...it, returnedQty: (it.returnedQty || 0) + hit.qty } : it
    })
    await ctx.store.update('orders', order._id, { items, refundedTotal: round2((order.refundedTotal || 0) + r.amount), updatedAt: ctx.now() })
    for (const it of r.items) {
      const raw = await ctx.store.get('books', it.book)
      if (!raw) continue
      const i = (raw.formats || []).findIndex((f) => f.type === it.format)
      if (restock && i >= 0) {
        const before = deriveBook(raw)
        await ctx.store.atomic('books', { _id: raw._id }, { $inc: { [`formats.${i}.stock`]: it.qty, stock: it.qty, sold: -it.qty } })
        const after = deriveBook(await ctx.store.get('books', raw._id))
        for (const f of after.formats.filter((x) => isPhysical(x.type))) {
          const was = findFormat(before, f.type)?.stock || 0
          if (was <= 0 && f.stock > 0) {
            const subs = await ctx.store.find('stockAlerts', { book: String(raw._id), format: f.type })
            for (const s of subs) await ctx.store.remove('stockAlerts', s._id)
            await notify(ctx, subs.map((s) => s.user), { type: 'stock', title: `Back in stock: ${after.title}`, body: `The ${f.type} edition is available again.`, link: `/books/${raw._id}` })
          }
        }
      }
    }
    const buyer = await ctx.store.get('users', order.user)
    if (buyer && order.pointsEarned) {
      const back = Math.min(buyer.points || 0, Math.floor((order.pointsEarned * r.amount) / Math.max(order.total, 1)))
      if (back > 0) {
        await ctx.store.atomic('users', { _id: buyer._id }, { $inc: { points: -back } })
        await ctx.store.insert('pointsLedger', { user: String(buyer._id), delta: -back, type: 'adjust', order: String(order._id), note: 'Points reversed for a refund', createdAt: ctx.now() })
      }
    }
    patch = { ...patch, refundedAt: ctx.now(), restocked: restock }
  }
  const out = await ctx.store.update('returns', r._id, patch)
  const word = { approved: 'approved', rejected: 'declined', received: 'received at our warehouse', refunded: `refunded ($${r.amount.toFixed(2)} to your original payment method)` }[status]
  await notify(ctx, r.user, { type: 'return', title: `Your return was ${word.split(' (')[0]}`, body: note || `Return for order #${shortId(r.order)}: ${word}.`, link: '/returns' })
  return out
})

// ---------- gift cards and loyalty ----------
route('GET', '/api/me/giftcards', 'user', async ({ ctx, user }) => {
  const mine = await ctx.store.find('giftcards', { $or: [{ purchaser: String(user._id) }, { toEmail: user.email }] }, { sort: { createdAt: -1 } })
  return mine.map((c) => ({ ...c, direction: String(c.purchaser) === String(user._id) ? 'purchased' : 'received' }))
})
route('POST', '/api/giftcards/check', 'user', async ({ ctx, body }) => {
  const code = str(body.code).toUpperCase()
  const c = GIFT_CODE_RE.test(code) ? await ctx.store.one('giftcards', { code }) : null
  if (!c || c.disabled) fail(404, 'No gift card found with that code')
  return { code: c.code, balance: c.balance, initial: c.initial }
})

route('GET', '/api/me/loyalty', 'user', async ({ ctx, user }) => {
  const settings = await getSettings(ctx)
  const u = await ctx.store.get('users', user._id)
  const ledger = sortBy(await ctx.store.find('pointsLedger', { user: String(user._id) }), '-createdAt').slice(0, 50)
  return { points: u.points || 0, lifetime: u.lifetimePoints || 0, tier: tierFor(u.lifetimePoints || 0, settings), value: round2((u.points || 0) * settings.loyalty.pointValue), settings: settings.loyalty, ledger }
})

route('PUT', '/api/me/profile', 'user', async ({ ctx, body, user }) => {
  const patch = {}
  const name = text(body, 'name', { max: 80 })
  if (name !== undefined) {
    if (!name) fail(400, 'Name is required (max 80 chars)')
    patch.name = name
  }
  if (body.country !== undefined) {
    const settings = await getSettings(ctx)
    if (!settings.tax[String(body.country).toUpperCase()]) fail(400, 'Choose a supported country')
    patch.country = String(body.country).toUpperCase()
  }
  const u = Object.keys(patch).length ? await ctx.store.update('users', user._id, patch) : user
  return { user: publicUser(u, await getSettings(ctx)) }
})

route('GET', '/api/settings/public', null, async ({ ctx }) => ({ ...(await getSettings(ctx)), countries: COUNTRIES }))
