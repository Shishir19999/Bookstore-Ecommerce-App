import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart, useReading, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { EmptyState } from '../ui/States'
import { READING_STATUSES, authorPath, money } from '../lib/format'

export default function ReadingList() {
  useTitle('My reading list')
  const { list, setStatus } = useReading()
  const { addToCart } = useCart()
  const toast = useToast()
  const [tab, setTab] = useState('all')
  const shown = tab === 'all' ? list : list.filter((e) => e.status === tab)
  const count = (s) => list.filter((e) => e.status === s).length

  return (
    <div className="container page">
      <h1>My reading list</h1>
      <div className="row" role="group" aria-label="Filter by status" style={{ marginBottom: 18 }}>
        <button type="button" className="chip" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All ({list.length})</button>
        {READING_STATUSES.map((s) => (
          <button key={s.value} type="button" className="chip" aria-pressed={tab === s.value} onClick={() => setTab(s.value)}>{s.label} ({count(s.value)})</button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title="Your reading list is empty" text="Tap the heart on any book to save it for later." to="/books" action="Find a book" />
      ) : shown.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="card" style={{ listStyle: 'none', margin: 0 }}>
          {shown.map(({ book, status }) => (
            <li className="line" key={book._id}>
              <Link to={`/books/${book._id}`}><Cover book={book} /></Link>
              <div>
                <Link to={`/books/${book._id}`} className="book-title">{book.title}</Link>
                <Link to={authorPath(book.author)} className="book-author">{book.author}</Link>
                <div className="seg" style={{ marginTop: 8 }} role="group" aria-label={`Status of ${book.title}`}>
                  {READING_STATUSES.map((s) => (
                    <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(book, s.value)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="line-actions">
                <strong>{money(book.price)}</strong>
                {book.stock > 0 && (
                  <button type="button" className="btn btn-sm" onClick={() => { addToCart(book); toast.success(`Added "${book.title}" to your cart.`) }}>Add to cart</button>
                )}
                <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => setStatus(book, null)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
