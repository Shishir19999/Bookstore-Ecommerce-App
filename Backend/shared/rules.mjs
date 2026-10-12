// Shared business rules for Folio Books: formats, pricing, shipping, tax, coupons, loyalty, returns and CSV.
// This file is the single source of truth. Backend/shared and Frontend/src/shared hold byte-identical copies
// (run `npm run sync:shared` in Backend after editing; a backend test fails if the copies drift).

export const FORMATS = ['paperback', 'hardcover', 'ebook', 'audiobook']
export const FORMAT_LABEL = { paperback: 'Paperback', hardcover: 'Hardcover', ebook: 'E-book', audiobook: 'Audiobook' }
export const isPhysical = (f) => f === 'paperback' || f === 'hardcover'
export const isDigital = (f) => f === 'ebook' || f === 'audiobook'

export const ROLES = ['user', 'staff', 'admin']
export const ROLE_LABEL = { user: 'Customer', staff: 'Staff', admin: 'Admin' }
export const isStaff = (u) => !!u && (u.role === 'staff' || u.role === 'admin')

export const ORDER_STATUSES = ['preorder', 'placed', 'processing', 'shipped', 'delivered', 'cancelled']
export const RETURN_STATUSES = ['requested', 'approved', 'received', 'refunded', 'rejected']
export const READING_STATUSES = ['want', 'reading', 'finished']
export const EVENT_TYPES = ['signing', 'reading', 'qna', 'launch', 'workshop']

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10
export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

export const slugify = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

// ---------- ISBN ----------
export const cleanIsbn = (s) => String(s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
export function isbn13Check(first12) {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}
export function isbn10To13(isbn10) {
  const core = '978' + isbn10.slice(0, 9)
  return core + isbn13Check(core)
}
export function validIsbn(raw) {
  const s = cleanIsbn(raw)
  if (s.length === 13 && /^\d{13}$/.test(s)) return isbn13Check(s.slice(0, 12)) === Number(s[12])
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i)
    return sum % 11 === 0
  }
  return false
}
// Returns a normalised ISBN-13 or '' when invalid.
export function toIsbn13(raw) {
  const s = cleanIsbn(raw)
  if (!validIsbn(s)) return ''
  return s.length === 10 ? isbn10To13(s) : s
}
export const makeIsbn13 = (n, prefix = '9798') => {
  const core = prefix + String(n).padStart(8, '0').slice(-8)
  return core + isbn13Check(core)
}

// ---------- countries, tax and settings ----------
export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
]

export const DEFAULT_SETTINGS = {
  storeName: 'Folio Books',
  currency: 'USD',
  shipping: { standard: 4.99, express: 11.99, international: 8, freeOver: 35, homeCountry: 'US' },
  giftWrap: 3.5,
  // Rates are fractions. Physical books and digital goods can be taxed differently (as in many countries).
  tax: {
    US: { physical: 0.07, digital: 0.07 },
    CA: { physical: 0.05, digital: 0.05 },
    GB: { physical: 0, digital: 0.2 },
    DE: { physical: 0.07, digital: 0.19 },
    FR: { physical: 0.055, digital: 0.2 },
    IN: { physical: 0, digital: 0.18 },
    AU: { physical: 0.1, digital: 0.1 },
  },
  loyalty: { earnPerDollar: 1, pointValue: 0.01, maxRedeemPct: 50, silverAt: 500, goldAt: 1500, silverBonus: 0.25, goldBonus: 0.5 },
  returns: { windowDays: 30, restockingNote: 'Physical books in resaleable condition are refunded in full.' },
  giftCards: { amounts: [10, 25, 50, 100], min: 5, max: 500 },
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
export function mergeSettings(stored, base = DEFAULT_SETTINGS) {
  const out = Array.isArray(base) ? base.slice() : { ...base }
  if (!isObj(stored)) return out
  for (const k of Object.keys(base)) {
    const b = base[k]
    const s = stored[k]
    if (s === undefined || s === null) continue
    if (isObj(b)) out[k] = mergeSettings(s, b)
    else if (Array.isArray(b)) out[k] = Array.isArray(s) ? s : b
    else if (typeof b === 'number') out[k] = Number.isFinite(Number(s)) ? Number(s) : b
    else if (typeof b === 'string') out[k] = typeof s === 'string' ? s : b
    else out[k] = s
  }
  // tax table may contain extra countries added by the admin
  if (isObj(base.tax) && isObj(stored.tax)) {
    for (const [code, r] of Object.entries(stored.tax)) if (!base.tax[code] && isObj(r)) out.tax[code] = { physical: Number(r.physical) || 0, digital: Number(r.digital) || 0 }
  }
  return out
}

export const taxRateFor = (settings, country, cls) => {
  const row = settings.tax[country] || settings.tax[settings.shipping.homeCountry] || { physical: 0, digital: 0 }
  return Number(row[cls]) || 0
}

// ---------- loyalty tiers ----------
export function tierFor(lifetime, settings = DEFAULT_SETTINGS) {
  const l = settings.loyalty
  if (lifetime >= l.goldAt) return { id: 'gold', name: 'Gold', bonus: l.goldBonus, freeShipping: true, next: null, needed: 0 }
  if (lifetime >= l.silverAt) return { id: 'silver', name: 'Silver', bonus: l.silverBonus, freeShipping: false, next: 'Gold', needed: l.goldAt - lifetime }
  return { id: 'bronze', name: 'Bronze', bonus: 0, freeShipping: false, next: 'Silver', needed: l.silverAt - lifetime }
}

// ---------- books and formats ----------
const DEFAULT_PRICE_MULT = { paperback: 1, hardcover: 1.55, ebook: 0.55, audiobook: 1.2 }

// Legacy books (no formats array) are treated as a single paperback.
export function bookFormats(book) {
  if (Array.isArray(book.formats) && book.formats.length) return book.formats
  return [{ type: 'paperback', price: Number(book.price) || 0, stock: Number(book.stock) || 0 }]
}
export const findFormat = (book, type) => bookFormats(book).find((f) => f.type === type)
export function defaultFormat(book) {
  const fs = bookFormats(book)
  return fs.find((f) => f.type === 'paperback') || fs.find((f) => isPhysical(f.type)) || fs[0]
}
export const suggestedPrice = (paperback, type) => {
  const mult = DEFAULT_PRICE_MULT[type] ?? 1
  return type === 'paperback' ? round2(paperback) : Math.max(1.99, Math.round(paperback * mult) - 0.01)
}

export const isUpcoming = (book, now = new Date()) => !!book.publishedAt && new Date(book.publishedAt).getTime() > new Date(now).getTime()

// Derived fields kept on the stored document so lists can filter and sort on them.
export function deriveBook(book) {
  const formats = bookFormats(book).map((f) => {
    const { stock: _s, ...rest } = f
    return { ...rest, price: round2(f.price), ...(isPhysical(f.type) ? { stock: Math.max(0, Math.floor(Number(f.stock) || 0)) } : {}) }
  })
  const def = formats.find((f) => f.type === 'paperback') || formats.find((f) => isPhysical(f.type)) || formats[0]
  const stock = formats.filter((f) => isPhysical(f.type)).reduce((s, f) => s + f.stock, 0)
  const prices = formats.map((f) => f.price)
  return { ...book, formats, price: def.price, stock, minPrice: Math.min(...prices), maxPrice: Math.max(...prices), hasDigital: formats.some((f) => isDigital(f.type)) }
}

// Availability of one format right now: { state, stock, label }
export function availability(book, type, now = new Date()) {
  const f = findFormat(book, type)
  if (!f) return { state: 'none', stock: 0, label: 'Not offered' }
  if (isUpcoming(book, now)) return { state: 'preorder', stock: isPhysical(type) ? f.stock : null, label: 'Pre-order' }
  if (isDigital(type)) return { state: 'digital', stock: null, label: 'Instant delivery' }
  if (f.stock <= 0) return { state: 'out', stock: 0, label: 'Out of stock' }
  if (f.stock <= 5) return { state: 'low', stock: f.stock, label: `Only ${f.stock} left` }
  return { state: 'in', stock: f.stock, label: 'In stock' }
}
export const canBuy = (book, type, now = new Date()) => {
  const a = availability(book, type, now)
  return a.state === 'in' || a.state === 'low' || a.state === 'digital' || (a.state === 'preorder' && (isDigital(type) || a.stock > 0))
}
export const anyBuyable = (book, now = new Date()) => bookFormats(book).some((f) => canBuy(book, f.type, now))

// ---------- coupons ----------
export function evalCoupon(coupon, subtotal, now = new Date()) {
  if (!coupon || !coupon.active) return { ok: false, discount: 0, message: 'Invalid coupon code' }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return { ok: false, discount: 0, message: 'This coupon has expired' }
  if (coupon.usageLimit && coupon.used >= coupon.usageLimit) return { ok: false, discount: 0, message: 'This coupon has been fully redeemed' }
  if (subtotal < (coupon.minSubtotal || 0)) return { ok: false, discount: 0, message: `Spend at least $${Number(coupon.minSubtotal).toFixed(2)} to use this coupon` }
  const raw = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value
  return { ok: true, discount: round2(Math.min(subtotal, raw)), message: 'Coupon applied' }
}

// ---------- shipping ----------
export function shippingFor({ physicalSubtotal, method, country, tier }, settings) {
  if (physicalSubtotal <= 0) return { cost: 0, free: false, reason: '' }
  const s = settings.shipping
  let cost = method === 'express' ? s.express : s.standard
  if (country && country !== s.homeCountry) cost += s.international
  if (method !== 'express') {
    if (tier?.freeShipping) return { cost: 0, free: true, reason: 'Gold member shipping' }
    if (physicalSubtotal >= s.freeOver) return { cost: 0, free: true, reason: `Free over $${s.freeOver}` }
  }
  return { cost: round2(cost), free: false, reason: '' }
}

// ---------- order totals ----------
// lines: [{ kind: 'book'|'giftcard', book, format, price, qty, bundle? }]; bundles: { [id]: { title, discountPct, bookIds } }
// opts: { coupon, pointsToRedeem, pointsBalance, giftWrap, method, country, tier, giftCardBalance, now }
export function computeTotals(lines, bundles, opts, settings) {
  const now = opts.now || new Date()
  const bookLines = lines.filter((l) => l.kind !== 'giftcard')
  const cardLines = lines.filter((l) => l.kind === 'giftcard')
  const lineTotal = (l) => round2(l.price * l.qty)
  const goods = round2(bookLines.reduce((s, l) => s + l.price * l.qty, 0))
  const giftCardTotal = round2(cardLines.reduce((s, l) => s + l.price * l.qty, 0))
  const physGoods = round2(bookLines.filter((l) => isPhysical(l.format)).reduce((s, l) => s + l.price * l.qty, 0))
  const digiGoods = round2(goods - physGoods)

  // box-set discount: only when every book of a set is present (tagged with the bundle id)
  const bundleBreakdown = []
  const tagged = new Map()
  for (const l of bookLines) if (l.bundle && bundles?.[l.bundle]) (tagged.get(l.bundle) || tagged.set(l.bundle, []).get(l.bundle)).push(l)
  for (const [id, ls] of tagged) {
    const b = bundles[id]
    const sets = Math.min(...b.bookIds.map((bid) => ls.filter((l) => String(l.book) === String(bid)).reduce((s, l) => s + l.qty, 0)))
    if (!Number.isFinite(sets) || sets < 1) continue
    const setPrice = b.bookIds.reduce((s, bid) => s + (ls.find((l) => String(l.book) === String(bid))?.price || 0), 0)
    bundleBreakdown.push({ id, title: b.title, sets, amount: round2((setPrice * sets * b.discountPct) / 100) })
  }
  const bundleDiscount = round2(bundleBreakdown.reduce((s, b) => s + b.amount, 0))

  let couponDiscount = 0
  let couponMessage = ''
  if (opts.coupon) {
    const r = evalCoupon(opts.coupon, round2(goods - bundleDiscount), now)
    if (!r.ok) return { error: r.message }
    couponDiscount = r.discount
    couponMessage = r.message
  }

  const afterCoupon = round2(goods - bundleDiscount - couponDiscount)
  const lo = settings.loyalty
  const maxPts = Math.floor((afterCoupon * (lo.maxRedeemPct / 100)) / lo.pointValue)
  const pointsUsed = Math.max(0, Math.min(Math.floor(opts.pointsToRedeem || 0), Math.floor(opts.pointsBalance ?? 0), maxPts))
  const pointsDiscount = round2(pointsUsed * lo.pointValue)

  const discountTotal = round2(bundleDiscount + couponDiscount + pointsDiscount)
  const ratio = goods > 0 ? Math.min(1, discountTotal / goods) : 0
  const country = opts.country || settings.shipping.homeCountry
  const taxPhys = round2(physGoods * (1 - ratio) * taxRateFor(settings, country, 'physical'))
  const taxDigi = round2(digiGoods * (1 - ratio) * taxRateFor(settings, country, 'digital'))
  const tax = round2(taxPhys + taxDigi)

  const ship = shippingFor({ physicalSubtotal: physGoods, method: opts.method, country, tier: opts.tier }, settings)
  const hasPhysical = physGoods > 0
  const giftWrap = opts.giftWrap && hasPhysical ? round2(settings.giftWrap) : 0

  const netGoods = round2(goods - discountTotal)
  const total = round2(netGoods + giftCardTotal + ship.cost + giftWrap + tax)
  const giftCardApplied = round2(Math.min(Math.max(0, opts.giftCardBalance || 0), total))
  const amountDue = round2(total - giftCardApplied)
  const mult = 1 + (opts.tier?.bonus || 0)
  const pointsEarned = Math.max(0, Math.floor(netGoods * lo.earnPerDollar * mult))

  return {
    subtotal: round2(goods + giftCardTotal),
    goods,
    giftCardTotal,
    bundleDiscount,
    bundleBreakdown,
    couponDiscount,
    couponMessage,
    pointsUsed,
    pointsDiscount,
    maxPoints: maxPts,
    discountTotal,
    shipping: ship.cost,
    shippingFree: ship.free,
    shippingReason: ship.reason,
    giftWrap,
    tax,
    taxRate: { physical: taxRateFor(settings, country, 'physical'), digital: taxRateFor(settings, country, 'digital') },
    total,
    giftCardApplied,
    amountDue,
    pointsEarned,
    hasPhysical,
    lineCount: lines.reduce((n, l) => n + l.qty, 0),
    lineTotals: lines.map(lineTotal),
  }
}

// Free-shipping progress for the cart banner.
export function freeShippingProgress(physicalSubtotal, settings) {
  const target = settings.shipping.freeOver
  return { target, remaining: Math.max(0, round2(target - physicalSubtotal)), pct: target > 0 ? Math.min(100, Math.round((physicalSubtotal / target) * 100)) : 100 }
}

// ---------- returns ----------
export function returnEligibility(order, settings, now = new Date()) {
  if (!order || order.status !== 'delivered') return { ok: false, reason: 'Only delivered orders can be returned.' }
  const since = new Date(order.deliveredAt || order.updatedAt || order.createdAt).getTime()
  const days = settings.returns.windowDays
  const left = Math.ceil((since + days * 86400000 - new Date(now).getTime()) / 86400000)
  if (left < 0) return { ok: false, reason: `The ${days}-day return window has closed.` }
  return { ok: true, daysLeft: left, reason: '' }
}

// ---------- CSV (formula-injection safe) ----------
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(columns, rows) {
  const head = columns.map((c) => csvCell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))
  return [head, ...body].join('\r\n') + '\r\n'
}

// ---------- dates ----------
export const dayKey = (d) => new Date(d).toISOString().slice(0, 10)
export const addDays = (key, n) => dayKey(new Date(new Date(key + 'T00:00:00Z').getTime() + n * 86400000))
export const shortId = (id) => String(id).slice(-6).toUpperCase()

export const GIFT_CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/
