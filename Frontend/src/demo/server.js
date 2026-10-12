// Browser-only live preview backend. It runs the very same engine as the Express API (src/shared, an exact copy of
// Backend/shared) over an in-memory store that is persisted to localStorage, so every page works on static hosting.
// Nothing here ever leaves the visitor's browser (apart from the optional Open Library ISBN lookup that staff trigger).
import * as E from '../shared/engine.mjs'
import catalog from '../shared/catalog.json'

const DB_KEY = 'folio_preview_db_v2'
const REV_KEY = 'folio_preview_rev'
const CHANNEL = 'folio-preview-realtime'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function sha256(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

let channel = null
try {
  channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null
} catch {
  channel = null
}

const ctx = {
  mode: 'preview',
  store: null,
  now: () => new Date().toISOString(),
  newId: E.newId,
  random: () => {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] / 2 ** 32
  },
  hash: async (pw) => `sha256:${await sha256(pw)}`,
  verify: async (pw, hash) => hash === `sha256:${await sha256(pw)}`,
  signToken: async (user) => `demo.${user._id}.${user.tokenVersion ?? 0}`,
  verifyToken: async (token) => {
    const [tag, id, tv] = String(token).split('.')
    if (tag !== 'demo' || !id) throw new Error('bad token')
    return { id, tv: Number(tv) || 0 }
  },
  fetch: (...a) => window.fetch(...a),
  loadClassics: () => import('../shared/classics.json').then((m) => m.default),
  emit: (room, event, payload) => channel?.postMessage({ room, event, payload }),
  payments: { label: 'preview', mode: () => 'preview' },
}

let ready = null
let rev = null

const readRev = () => {
  try {
    return localStorage.getItem(REV_KEY) || '0'
  } catch {
    return '0'
  }
}
function persist() {
  try {
    rev = String(Date.now())
    localStorage.setItem(DB_KEY, JSON.stringify(ctx.store.data))
    localStorage.setItem(REV_KEY, rev)
  } catch {
    /* storage full or blocked: the data then lives for this tab only */
  }
}

async function init() {
  try {
    localStorage.removeItem('bookstore_demo_db_v1')
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data.books) && data.books.length) {
        ctx.store = E.createMemStore(data)
        rev = readRev()
        return
      }
    }
  } catch {
    /* corrupted or unavailable storage: reseed */
  }
  ctx.store = E.createMemStore()
  const classics = await ctx.loadClassics()
  await E.seedStore(ctx, { catalog, classics })
  persist()
}

// Another tab may have written: reload from storage when the revision changed.
function refreshFromStorage() {
  if (readRev() === rev) return
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      ctx.store = E.createMemStore(JSON.parse(raw))
      rev = readRev()
    }
  } catch {
    /* keep the in-memory copy */
  }
}

export async function resetDemoData() {
  try {
    localStorage.removeItem(DB_KEY)
    localStorage.removeItem(REV_KEY)
  } catch {
    /* ignore */
  }
  ready = null
  ctx.store = null
  await (ready = init())
}

// Downscales an uploaded cover so it fits comfortably in localStorage.
async function fileToCover(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw Object.assign(new Error('Cover must be a JPEG, PNG, WebP or GIF image'), { status: 400 })
  if (file.size > 2 * 1024 * 1024) throw Object.assign(new Error('Cover image must be 2MB or smaller'), { status: 400 })
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(Object.assign(new Error('Uploaded file is not a valid image'), { status: 400 }))
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
    if (o.cover instanceof File) o.__cover = await fileToCover(o.cover)
    delete o.cover
    return o
  }
  return body && typeof body === 'object' ? body : {}
}

export async function demoRequest(path, { method = 'GET', body, token } = {}) {
  await (ready ||= init())
  refreshFromStorage()
  await sleep(40 + Math.random() * 110) // a little latency so loading states are visible
  const u = new URL(path, 'http://preview.local')
  const query = Object.fromEntries(u.searchParams)
  const payload = await bodyToObject(body)
  try {
    const out = await E.handle(ctx, { method, path: u.pathname, query, body: payload, token })
    if (method !== 'GET') persist()
    return JSON.parse(JSON.stringify(out.data)) // behave like a JSON response (no shared references)
  } catch (err) {
    if (method !== 'GET') persist()
    throw err
  }
}
