import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useConfirm, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import AdminNav from './AdminNav'
import Cover from '../ui/Cover'
import { money } from '../lib/format'

export default function Books() {
  useTitle('Manage books')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const params = new URLSearchParams({ page, limit: 12, sort: 'title' })
  if (q) params.set('search', q)
  const { data, error, reload } = useFetch(`/api/books?${params}`)
  const confirm = useConfirm()
  const toast = useToast()

  const remove = async (b) => {
    if (!(await confirm({ title: `Delete "${b.title}"?`, message: 'The book and its reviews are removed from the store. This cannot be undone.', confirmLabel: 'Delete book', danger: true }))) return
    try {
      await api(`/api/books/${b._id}`, { method: 'DELETE' })
      toast.success(`Deleted "${b.title}".`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="container page">
      <div className="row between">
        <h1>Manage books</h1>
        <Link to="/admin/books/new" className="btn btn-primary">Add a book</Link>
      </div>
      <AdminNav />
      <form
        className="row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setQ(search.trim())
        }}
        style={{ marginBottom: 14 }}
      >
        <label className="sr-only" htmlFor="admin-q">Search books</label>
        <input id="admin-q" className="input" style={{ maxWidth: 320 }} placeholder="Search title or author" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-sm">Search</button>
      </form>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton />
      ) : data.books.length === 0 ? (
        <EmptyState title="No books found" text="Try a different search or add a new book." />
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Books in the catalogue</caption>
            <thead><tr><th>Cover</th><th>Title</th><th>Genre</th><th className="num">Price</th><th className="num">Stock</th><th className="num">Sold</th><th>Actions</th></tr></thead>
            <tbody>
              {data.books.map((b) => (
                <tr key={b._id}>
                  <td style={{ width: 56 }}><div className="thumb"><Cover book={b} /></div></td>
                  <td><strong>{b.title}</strong><div className="small muted">{b.author}</div></td>
                  <td>{b.genre}</td>
                  <td className="num">{money(b.price)}</td>
                  <td className="num"><span className={`pill ${b.stock === 0 ? 'pill-danger' : b.stock <= 5 ? 'pill-warn' : ''}`}>{b.stock === 0 ? 'Out' : b.stock <= 5 ? `Low: ${b.stock}` : b.stock}</span></td>
                  <td className="num">{b.sold}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <Link to={`/admin/books/${b._id}/edit`} className="btn btn-sm">Edit</Link>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(b)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="small">Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  )
}
