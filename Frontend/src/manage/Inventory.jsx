import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, downloadCsv } from '../api'
import { useAuth, useConfirm, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { FormatIcon, Pager } from '../ui/Parts'
import ManageNav from './ManageNav'
import Cover from '../ui/Cover'
import { FORMAT_LABEL, fmtDateTime, money } from '../lib/format'
import { isPhysical } from '../shared/rules.mjs'

function StockCell({ book, f, onDone }) {
  const toast = useToast()
  const [delta, setDelta] = useState('')
  const [busy, setBusy] = useState(false)
  const apply = async (e) => {
    e.preventDefault()
    const n = Number(delta)
    if (!Number.isInteger(n) || n === 0) return
    setBusy(true)
    try {
      await api(`/api/books/${book._id}/stock`, { method: 'PATCH', body: { format: f.type, delta: n, reason: n > 0 ? 'Received stock' : 'Adjustment' } })
      toast.success(`${book.title}: ${FORMAT_LABEL[f.type]} stock ${n > 0 ? '+' : ''}${n}.`)
      setDelta('')
      onDone()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stock-cell" onSubmit={apply}>
      <span className="small"><FormatIcon type={f.type} /> {FORMAT_LABEL[f.type]}</span>
      <span className={`pill ${f.stock === 0 ? 'pill-danger' : f.stock <= 5 ? 'pill-warn' : ''}`}>{f.stock}</span>
      <label className="sr-only" htmlFor={`d-${book._id}-${f.type}`}>Change {FORMAT_LABEL[f.type]} stock of {book.title} by</label>
      <input id={`d-${book._id}-${f.type}`} className="input" type="number" placeholder="+/-" value={delta} onChange={(e) => setDelta(e.target.value)} style={{ width: 66, minHeight: 32 }} />
      <button className="btn btn-sm" disabled={busy || !delta}>Apply</button>
    </form>
  )
}

export default function Inventory() {
  useTitle('Books and stock')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1)
  const filter = params.get('filter') || ''
  const [q, setQ] = useState(params.get('q') || '')
  const query = new URLSearchParams({ page, limit: 12 })
  if (filter) query.set('filter', filter)
  if (params.get('q')) query.set('q', params.get('q'))
  const { data, error, reload } = useFetch(`/api/staff/inventory?${query}`)
  const moves = useFetch('/api/staff/stock-moves')
  const confirm = useConfirm()
  const toast = useToast()
  const set = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const remove = async (b) => {
    if (!(await confirm({ title: `Delete "${b.title}"?`, message: 'The book, its reviews and questions are removed from the store. Past orders keep their snapshot. This cannot be undone.', confirmLabel: 'Delete book', danger: true }))) return
    try {
      await api(`/api/books/${b._id}`, { method: 'DELETE' })
      toast.success(`Deleted "${b.title}".`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const exportCsv = () => downloadCsv('/api/export/inventory.csv', 'inventory.csv').catch((e) => toast.error(e.message))
  return (
    <div className="container page">
      <div className="row between">
        <h1>Books and stock</h1>
        <div className="row">
          <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
          <Link to="/manage/isbn" className="btn">Add by ISBN</Link>
          <Link to="/manage/books/new" className="btn btn-primary">Add a book</Link>
        </div>
      </div>
      <ManageNav />
      <div className="row" style={{ marginBottom: 14 }}>
        <form className="row" role="search" onSubmit={(e) => (e.preventDefault(), set({ q: q.trim() }))}>
          <label className="sr-only" htmlFor="inv-q">Search title, author or ISBN</label>
          <input id="inv-q" className="input" style={{ maxWidth: 300 }} placeholder="Title, author or ISBN" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-sm">Search</button>
        </form>
        <div className="row" role="group" aria-label="Filter">
          {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['preorder', 'Pre-orders']].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => set({ filter: v })}>{l}</button>)}
        </div>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.books.length === 0 ? <EmptyState title="No books found" text="Try a different filter or add a new book." /> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Books, editions and stock</caption>
            <thead><tr><th scope="col">Book</th><th scope="col">Editions and stock</th><th scope="col" className="num">Sold</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {data.books.map((b) => (
                <tr key={b._id}>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <div className="thumb"><Cover book={b} /></div>
                      <div><strong>{b.title}</strong><div className="small muted">{b.author}</div>{b.upcoming && <span className="pill pill-accent">Pre-order, {fmtDateTime(b.publishedAt)}</span>}</div>
                    </div>
                  </td>
                  <td>
                    <div className="stock-grid">
                      {b.formats.map((f) => isPhysical(f.type) ? <StockCell key={f.type} book={b} f={f} onDone={() => (reload(), moves.reload())} /> : <span key={f.type} className="small muted"><FormatIcon type={f.type} /> {FORMAT_LABEL[f.type]} {money(f.price)} (digital)</span>)}
                    </div>
                  </td>
                  <td className="num">{b.sold}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <Link to={`/manage/books/${b._id}/edit`} className="btn btn-sm">Edit</Link>
                      {user.role === 'admin' && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(b)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: String(p) })} />}
      {moves.data?.length > 0 && (
        <section className="card" style={{ marginTop: 24 }} aria-labelledby="mv-h">
          <h2 id="mv-h" style={{ fontSize: '1.2rem' }}>Recent stock movements</h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Stock movements</caption>
              <thead><tr><th>When</th><th>Book</th><th>Edition</th><th className="num">From</th><th className="num">To</th><th>By</th><th>Reason</th></tr></thead>
              <tbody>{moves.data.slice(0, 8).map((m) => <tr key={m._id}><td>{fmtDateTime(m.createdAt)}</td><td>{m.title}</td><td>{FORMAT_LABEL[m.format]}</td><td className="num">{m.from}</td><td className="num">{m.to}</td><td>{m.by}</td><td>{m.reason}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
