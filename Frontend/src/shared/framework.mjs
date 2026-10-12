// Tiny router + helpers shared by every feature module. The same routes run behind Express (real mode) and
// inside the browser (live preview): adapters only provide a `ctx` (storage, hashing, tokens, fetch, realtime).
import { DEFAULT_SETTINGS, mergeSettings, tierFor, round2, isStaff } from './rules.mjs'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message)
}
export const need = (cond, status, message) => {
  if (!cond) throw new HttpError(status, message)
}

const routes = []
export function route(method, pattern, auth, handler) {
  const names = []
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$')
  routes.push({ method, re, names, auth, handler })
}
export const listRoutes = () => routes.map((r) => `${r.method} ${r.re.source}`)

const ROLE_OK = { user: ['user', 'staff', 'admin'], staff: ['staff', 'admin'], admin: ['admin'] }

export async function authenticate(ctx, token) {
  if (!token) throw new HttpError(401, 'Authentication required')
  let payload
  try {
    payload = await ctx.verifyToken(token)
  } catch {
    throw new HttpError(401, 'Invalid or expired token')
  }
  const user = payload?.id ? await ctx.store.get('users', payload.id) : null
  if (!user) throw new HttpError(401, 'User no longer exists')
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw new HttpError(401, 'Token has been revoked, please log in again')
  if (user.disabled) throw new HttpError(403, 'This account has been disabled')
  return user
}

const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// req: { method, path, query, body, token } -> { status, data }  (throws HttpError)
export async function handle(ctx, req) {
  const method = (req.method || 'GET').toUpperCase()
  const path = req.path.split('?')[0]
  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.re.exec(path)
    if (!m) continue
    const params = {}
    r.names.forEach((n, i) => (params[n] = decode(m[i + 1])))
    let user = null
    if (r.auth) {
      user = await authenticate(ctx, req.token)
      if (!ROLE_OK[r.auth].includes(user.role)) {
        throw new HttpError(403, r.auth === 'admin' ? 'Admin access required' : r.auth === 'staff' ? 'Staff access required' : 'Forbidden')
      }
    } else if (req.token) {
      user = await authenticate(ctx, req.token).catch(() => null)
    }
    const out = await r.handler({ ctx, store: ctx.store, user, params, query: req.query || {}, body: req.body && typeof req.body === 'object' ? req.body : {}, req })
    if (Array.isArray(out) && typeof out[0] === 'number') return { status: out[0], data: out[1] }
    return { status: 200, data: out }
  }
  throw new HttpError(404, 'Not found')
}

// ---------- helpers used by feature modules ----------
export const str = (v) => (typeof v === 'string' ? v.trim() : '')
export function text(body, key, { max = 200, min = 0, label = key, required = false } = {}) {
  const v = body[key]
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `${label} is required`)
    return undefined
  }
  if (typeof v !== 'string') throw new HttpError(400, `${label} must be a string`)
  const t = v.trim()
  if (required && !t) throw new HttpError(400, `${label} is required`)
  if (t && t.length < min) throw new HttpError(400, `${label} must be at least ${min} characters`)
  if (t.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`)
  return t
}
export function int(v, { min = 0, max = 1e9, label = 'value', def } = {}) {
  if (v === undefined || v === null || v === '') {
    if (def !== undefined) return def
    throw new HttpError(400, `${label} is required`)
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}`)
  return n
}
export function num(v, { min = 0, max = 1e9, label = 'value', def } = {}) {
  if (v === undefined || v === null || v === '') {
    if (def !== undefined) return def
    throw new HttpError(400, `${label} is required`)
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be a number between ${min} and ${max}`)
  return n
}
export const looksId = (s) => typeof s === 'string' && /^[0-9a-zA-Z_-]{1,40}$/.test(s)

export const publicUser = (u, settings = DEFAULT_SETTINGS) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  country: u.country || 'US',
  points: u.points || 0,
  tier: tierFor(u.lifetimePoints || 0, settings).id,
})

export async function getSettings(ctx) {
  const row = await ctx.store.get('settings', 'main')
  return mergeSettings(row?.value)
}

export async function notify(ctx, userIds, n) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))]
  for (const id of ids) {
    await ctx.store.insert('notifications', { user: id, type: n.type || 'info', title: n.title, body: n.body || '', link: n.link || '', read: false, createdAt: ctx.now() })
  }
}

export const sortBy = (list, ...keys) =>
  list.slice().sort((a, b) => {
    for (const k of keys) {
      const desc = k.startsWith('-')
      const f = desc ? k.slice(1) : k
      const av = a[f]
      const bv = b[f]
      if (av === bv) continue
      const c = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0)
      if (c) return desc ? -c : c
    }
    return 0
  })

export function paginate(list, query, defLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defLimit, 1), maxLimit)
  return { page, limit, total: list.length, pages: Math.max(Math.ceil(list.length / limit), 1), slice: list.slice((page - 1) * limit, page * limit) }
}

export const roleIsStaff = isStaff
export { round2 }
