import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTitle, useToast } from '../hooks'
import { Field } from '../ui/Parts'
import ManageNav from './ManageNav'
import Cover from '../ui/Cover'
import { fmtDate, money } from '../lib/format'

export default function Isbn() {
  useTitle('Add by ISBN')
  const toast = useToast()
  const navigate = useNavigate()
  const [isbn, setIsbn] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [price, setPrice] = useState('14.99')
  const [stock, setStock] = useState('10')
  // quick add
  const [qa, setQa] = useState({ isbn: '', qty: '1', price: '' })
  const [log, setLog] = useState([])
  const [qaError, setQaError] = useState('')
  const qaRef = useRef(null)

  const lookup = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setRes(null)
    try {
      setRes(await api(`/api/staff/isbn/${encodeURIComponent(isbn.trim())}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const importIt = async () => {
    setBusy(true)
    setError('')
    try {
      const out = await api('/api/staff/isbn/import', { method: 'POST', body: { isbn: res.isbn, ...res.data, price: Number(price), stock: Number(stock) } })
      toast.success(`Added "${out.book.title}" to the catalogue.`)
      navigate(`/manage/books/${out.book._id}/edit`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const editFirst = () => navigate('/manage/books/new', { state: { prefill: { ...res.data, isbn: res.isbn, pages: res.data?.pages ? String(res.data.pages) : '', publishedAt: res.data?.publishedAt?.slice(0, 10) || '', price, stock } } })
  const quick = async (e) => {
    e.preventDefault()
    setQaError('')
    try {
      const out = await api('/api/staff/quick-add', { method: 'POST', body: { isbn: qa.isbn.trim(), qty: Number(qa.qty) || 1, price: qa.price || undefined } })
      setLog((l) => [{ id: Date.now(), text: out.action === 'restocked' ? `Added ${out.added} to "${out.book.title}" (now ${out.book.stock} in stock)` : `Created "${out.book.title}" with ${out.added} in stock${out.source === 'openlibrary' ? ' (details from Open Library)' : ''}` }, ...l].slice(0, 8))
      setQa({ ...qa, isbn: '' })
      qaRef.current?.focus()
    } catch (err) {
      setQaError(err.message)
    }
  }
  return (
    <div className="container page">
      <h1>Add by ISBN</h1>
      <ManageNav />
      <div className="admin-two">
        <section className="card" aria-labelledby="look-h">
          <h2 id="look-h" style={{ fontSize: '1.25rem' }}>Look up a new title</h2>
          <p className="small muted">Details come from the free Open Library catalogue (no key needed). If it cannot be reached you can still enter everything by hand.</p>
          <form onSubmit={lookup} noValidate className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
            <Field className="grow" label="ISBN-10 or ISBN-13" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-0-14-143951-8" inputMode="numeric" autoComplete="off" style={{ marginBottom: 0 }} />
            <button className="btn btn-primary" disabled={busy || !isbn.trim()} style={{ marginBottom: 14 }}>{busy ? 'Looking up...' : 'Look up'}</button>
          </form>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {res && (
            <div className="isbn-result" role="status">
              {res.existing && <p className="alert alert-info">Already in the catalogue: <Link to={`/manage/books/${res.existing._id}/edit`}>{res.existing.title}</Link>. Use quick add to receive stock.</p>}
              {res.found ? (
                <>
                  <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <div style={{ width: 90, flex: 'none' }}><Cover book={{ title: res.data.title, author: res.data.author, genre: res.data.genre, image: res.data.image }} /></div>
                    <div>
                      <strong>{res.data.title}</strong>
                      <p className="small muted" style={{ margin: '2px 0' }}>{res.data.author}{res.data.publisher ? ` · ${res.data.publisher}` : ''}{res.data.pages ? ` · ${res.data.pages} pages` : ''}{res.data.publishedAt ? ` · ${fmtDate(res.data.publishedAt)}` : ''}</p>
                      {res.data.genre && <span className="pill">{res.data.genre}</span>} <span className="pill mono">{res.isbn}</span>
                    </div>
                  </div>
                  {!res.existing && (
                    <>
                      <div className="grid2" style={{ marginTop: 12 }}>
                        <Field label="Paperback price (USD)" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
                        <Field label="Copies in stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
                      </div>
                      <div className="row">
                        <button type="button" className="btn btn-primary" disabled={busy} onClick={importIt}>Add to catalogue ({money(Number(price) || 0)})</button>
                        <button type="button" className="btn" onClick={editFirst}>Edit details first</button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className={res.offline ? 'alert alert-error' : 'alert alert-info'}>{res.message}</p>
                  {!res.existing && <button type="button" className="btn" onClick={editFirst}>Enter the details by hand</button>}
                </>
              )}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="quick-h">
          <h2 id="quick-h" style={{ fontSize: '1.25rem' }}>Quick add and receive stock</h2>
          <p className="small muted">Type an ISBN (or use a USB scanner that types digits and presses Enter) and a quantity. Known titles are restocked; new ones are created from the lookup.</p>
          <form onSubmit={quick} noValidate>
            <div className="field">
              <label htmlFor="qa-isbn">ISBN</label>
              <input id="qa-isbn" ref={qaRef} className="input mono" value={qa.isbn} onChange={(e) => setQa({ ...qa, isbn: e.target.value })} inputMode="numeric" autoComplete="off" aria-invalid={!!qaError} aria-describedby={qaError ? 'qa-err' : undefined} />
              {qaError && <span className="err" id="qa-err" role="alert">{qaError}</span>}
            </div>
            <div className="grid2">
              <Field label="Quantity" type="number" min="1" value={qa.qty} onChange={(e) => setQa({ ...qa, qty: e.target.value })} />
              <Field label="Price if new (USD)" type="number" step="0.01" min="0" value={qa.price} onChange={(e) => setQa({ ...qa, price: e.target.value })} placeholder="14.99" />
            </div>
            <button className="btn btn-primary" disabled={!qa.isbn.trim()}>Add</button>
          </form>
          {log.length > 0 && <ul className="plain small" style={{ marginTop: 14 }} aria-live="polite">{log.map((l) => <li key={l.id} style={{ padding: '4px 0' }}>{l.text}</li>)}</ul>}
        </section>
      </div>
    </div>
  )
}
