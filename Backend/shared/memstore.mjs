// In-memory document store with the same interface as the MongoDB adapter (Backend/lib/mongostore.js).
// Used by the browser live preview (persisted to localStorage by the adapter) and by fast unit tests.

const hex = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
export const newId = hex

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

// All values found at a dotted path (arrays are flattened, as in MongoDB).
function valuesAt(obj, path) {
  let cur = [obj]
  for (const key of path.split('.')) {
    const next = []
    for (const c of cur) {
      if (c === null || c === undefined) continue
      if (Array.isArray(c) && !/^\d+$/.test(key)) {
        for (const item of c) if (item && typeof item === 'object' && key in item) next.push(item[key])
      } else if (typeof c === 'object' && key in c) next.push(c[key])
    }
    cur = next
  }
  return cur.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]))
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
function matchValue(vals, cond) {
  const isOp = cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))
  if (!isOp) return vals.some((v) => (Array.isArray(cond) ? JSON.stringify(v) === JSON.stringify(cond) : v === cond)) || (cond === null && vals.length === 0)
  for (const [op, arg] of Object.entries(cond)) {
    switch (op) {
      case '$in':
        if (!vals.some((v) => arg.includes(v))) return false
        break
      case '$nin':
        if (vals.some((v) => arg.includes(v))) return false
        break
      case '$ne':
        if (vals.some((v) => v === arg)) return false
        break
      case '$gt':
        if (!vals.some((v) => v !== null && v !== undefined && cmp(v, arg) > 0)) return false
        break
      case '$gte':
        if (!vals.some((v) => v !== null && v !== undefined && cmp(v, arg) >= 0)) return false
        break
      case '$lt':
        if (!vals.some((v) => v !== null && v !== undefined && cmp(v, arg) < 0)) return false
        break
      case '$lte':
        if (!vals.some((v) => v !== null && v !== undefined && cmp(v, arg) <= 0)) return false
        break
      case '$exists':
        if (arg ? vals.length === 0 : vals.length > 0) return false
        break
      default:
        throw new Error(`Unsupported operator ${op}`)
    }
  }
  return true
}
export function matches(doc, filter) {
  for (const [k, cond] of Object.entries(filter || {})) {
    if (k === '$or') {
      if (!cond.some((f) => matches(doc, f))) return false
    } else if (!matchValue(valuesAt(doc, k), cond)) return false
  }
  return true
}

function setPath(obj, path, value) {
  const keys = path.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined || cur[keys[i]] === null) cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}
const getPath = (obj, path) => path.split('.').reduce((c, k) => (c === undefined || c === null ? undefined : c[k]), obj)
function unsetPath(obj, path) {
  const keys = path.split('.')
  const parent = getPath(obj, keys.slice(0, -1).join('.')) ?? (keys.length === 1 ? obj : undefined)
  if (parent) delete parent[keys[keys.length - 1]]
}

function applyOps(doc, ops) {
  for (const [path, v] of Object.entries(ops.$set || {})) setPath(doc, path, clone(v))
  for (const path of Object.keys(ops.$unset || {})) unsetPath(doc, path)
  for (const [path, v] of Object.entries(ops.$inc || {})) setPath(doc, path, (Number(getPath(doc, path)) || 0) + v)
  for (const [path, v] of Object.entries(ops.$push || {})) {
    const arr = getPath(doc, path) || []
    arr.push(clone(v))
    setPath(doc, path, arr)
  }
  for (const [path, v] of Object.entries(ops.$addToSet || {})) {
    const arr = getPath(doc, path) || []
    if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(v))) arr.push(clone(v))
    setPath(doc, path, arr)
  }
  for (const [path, v] of Object.entries(ops.$pull || {})) {
    const arr = getPath(doc, path) || []
    const isCond = v && typeof v === 'object' && !Array.isArray(v)
    setPath(doc, path, arr.filter((x) => !(isCond && typeof x === 'object' ? matches(x, v) : JSON.stringify(x) === JSON.stringify(v))))
  }
}

export function createMemStore(initial = {}) {
  const data = {}
  for (const [k, v] of Object.entries(initial)) data[k] = v
  const coll = (name) => (data[name] ||= [])
  const sorter = (sort) => (a, b) => {
    for (const [k, dir] of Object.entries(sort)) {
      const av = getPath(a, k)
      const bv = getPath(b, k)
      if (av === bv) continue
      const c = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : cmp(av ?? 0, bv ?? 0)
      if (c) return c * dir
    }
    return 0
  }
  return {
    data,
    async find(name, filter = {}, { sort, limit, skip = 0 } = {}) {
      let rows = coll(name).filter((d) => matches(d, filter))
      if (sort) rows = rows.slice().sort(sorter(sort))
      if (skip) rows = rows.slice(skip)
      if (limit) rows = rows.slice(0, limit)
      return clone(rows)
    },
    async get(name, id) {
      return clone(coll(name).find((d) => String(d._id) === String(id)) || null)
    },
    async one(name, filter) {
      return clone(coll(name).find((d) => matches(d, filter)) || null)
    },
    async count(name, filter = {}) {
      return coll(name).filter((d) => matches(d, filter)).length
    },
    async insert(name, doc) {
      const row = clone({ ...doc, _id: doc._id ? String(doc._id) : newId() })
      coll(name).push(row)
      return clone(row)
    },
    async insertMany(name, docs) {
      for (const d of docs) coll(name).push(clone({ ...d, _id: d._id ? String(d._id) : newId() }))
      return docs.length
    },
    async update(name, id, patch, unset = []) {
      const row = coll(name).find((d) => String(d._id) === String(id))
      if (!row) return null
      applyOps(row, { $set: patch, $unset: Object.fromEntries(unset.map((k) => [k, 1])) })
      return clone(row)
    },
    async atomic(name, filter, ops) {
      const row = coll(name).find((d) => matches(d, filter))
      if (!row) return 0
      applyOps(row, ops)
      return 1
    },
    async remove(name, id) {
      const i = coll(name).findIndex((d) => String(d._id) === String(id))
      if (i < 0) return false
      coll(name).splice(i, 1)
      return true
    },
    async removeWhere(name, filter) {
      const before = coll(name).length
      data[name] = coll(name).filter((d) => !matches(d, filter))
      return before - data[name].length
    },
  }
}
