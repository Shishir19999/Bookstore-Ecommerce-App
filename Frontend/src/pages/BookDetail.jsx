import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useCart, useConfirm, useFetch, useReading, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { Stars, StarInput } from '../ui/Stars'
import { ErrorState, PageSkeleton } from '../ui/States'
import BookCard from '../components/ProductItem'
import { READING_STATUSES, authorPath, fmtDate, genrePath, money } from '../lib/format'

function Reviews({ book, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useFetch(`/api/books/${book._id}/reviews`)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const reviews = data?.reviews || []
  const mine = user && reviews.find((r) => String(r.user?._id ?? r.user) === String(user.id))
  const counts = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => r.rating === n).length)
  const max = Math.max(1, ...counts)

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!rating) return
    setBusy(true)
    try {
      await api(`/api/books/${book._id}/reviews`, { method: 'POST', body: { rating, text } })
      toast.success(mine ? 'Your review was updated.' : 'Thanks for your review!')
      setText('')
      setRating(0)
      setTouched(false)
      reload()
      onChanged()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete your review?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try {
      await api(`/api/books/${book._id}/reviews/mine`, { method: 'DELETE' })
      toast.success('Review deleted.')
      reload()
      onChanged()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <section aria-labelledby="reviews-h" style={{ marginTop: 40 }}>
      <h2 id="reviews-h">Reader reviews</h2>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <p className="muted">Loading reviews...</p>}
      {data && (
        <div className="review-layout">
          <div>
            <p style={{ fontFamily: 'var(--serif)', fontSize: '2.6rem', lineHeight: 1, margin: '0 0 6px' }}>{data.numReviews ? data.rating.toFixed(1) : '-'}</p>
            <Stars value={data.rating} count={data.numReviews} />
            <div className="rating-bars" style={{ marginTop: 12 }}>
              {[5, 4, 3, 2, 1].map((n, i) => (
                <div className="bar" key={n}>
                  <span>{n}</span>
                  <i><b style={{ width: `${(counts[i] / max) * 100}%` }} /></i>
                  <span>{counts[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            {user ? (
              <form className="card" onSubmit={submit} noValidate style={{ marginBottom: 18 }}>
                <h3>{mine ? 'Update your review' : 'Write a review'}</h3>
                <StarInput value={rating} onChange={setRating} describedBy={touched && !rating ? 'rating-err' : undefined} />
                {touched && !rating && <p className="err" id="rating-err" role="alert">Choose a star rating.</p>}
                <div className="field" style={{ marginTop: 10 }}>
                  <label htmlFor="review-text">Your thoughts (optional)</label>
                  <textarea id="review-text" className="input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
                  <span className="hint">{text.length}/1000</span>
                </div>
                <div className="row">
                  <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : mine ? 'Update review' : 'Post review'}</button>
                  {mine && <button type="button" className="btn btn-outline-danger" onClick={remove}>Delete my review</button>}
                </div>
              </form>
            ) : (
              <p className="alert alert-info"><Link to="/login" state={{ from: `/books/${book._id}` }}>Log in</Link> to rate and review this book.</p>
            )}
            {reviews.length === 0 ? (
              <p className="muted">No reviews yet. Be the first to share what you thought.</p>
            ) : (
              reviews.map((r) => (
                <article className="review" key={r._id}>
                  <div className="row between">
                    <strong>{r.name}</strong>
                    <span className="small muted">{fmtDate(r.createdAt)}</span>
                  </div>
                  <Stars value={r.rating} />
                  {r.text && <p style={{ margin: '6px 0 0' }}>{r.text}</p>}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default function BookDetail() {
  const { id } = useParams()
  const { data: book, error, reload } = useFetch(`/api/books/${id}`)
  const related = useFetch(`/api/books/${id}/related`)
  const { addToCart } = useCart()
  const { statusOf, setStatus } = useReading()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [full, setFull] = useState(false)
  useTitle(book?.title)

  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Book not found' : undefined} message={error} onRetry={/not found/i.test(error) ? undefined : reload} /></div>
  if (!book || book._id !== id) return <PageSkeleton />

  const status = statusOf(book._id)
  const max = Math.min(book.stock, 20)
  const stockPill =
    book.stock === 0 ? <span className="pill pill-danger">Out of stock</span> : book.stock <= 5 ? <span className="pill pill-warn">Only {book.stock} left</span> : <span className="pill pill-success">In stock</span>

  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
        <Link to="/books">Books</Link> / {book.genre && <><Link to={genrePath(book.genre)}>{book.genre}</Link> / </>}{book.title}
      </nav>
      <div className="detail">
        <Cover book={book} eager />
        <div>
          <h1>{book.title}</h1>
          <p style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>by <Link to={authorPath(book.author)}>{book.author}</Link></p>
          <Stars value={book.rating} count={book.numReviews} />
          <div className="meta" style={{ marginTop: 12 }}>
            {book.genre && <span>{book.genre}</span>}
            {book.language && <span>{book.language}</span>}
            {book.pages && <span>{book.pages} pages</span>}
            {book.publishedAt && <span>Published {fmtDate(book.publishedAt)}</span>}
            {stockPill}
          </div>
          <p>{book.description}</p>

          <div className="buy">
            <span className="price">{money(book.price)}</span>
            {book.stock > 0 && (
              <>
                <div className="qty" role="group" aria-label="Quantity">
                  <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>-</button>
                  <output aria-live="polite">{qty}</output>
                  <button type="button" aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(qty + 1)}>+</button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    addToCart(book, qty)
                    toast.success(`Added ${qty} x "${book.title}" to your cart.`)
                  }}
                >
                  Add to cart
                </button>
              </>
            )}
          </div>

          <div className="row" role="group" aria-label="Reading list">
            <span className="small muted">Reading list:</span>
            <div className="seg">
              {READING_STATUSES.map((s) => (
                <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(book, s.value)}>{s.label}</button>
              ))}
            </div>
            {status && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(book, null)}>Remove</button>}
          </div>
        </div>
      </div>

      {book.excerpt && (
        <section aria-labelledby="excerpt-h" style={{ marginTop: 40, maxWidth: 720 }}>
          <h2 id="excerpt-h">Read a preview</h2>
          <div className={`excerpt ${full ? '' : 'excerpt-fade'}`}>{book.excerpt}</div>
          <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} aria-expanded={full} onClick={() => setFull(!full)}>
            {full ? 'Show less' : 'Keep reading'}
          </button>
        </section>
      )}

      <Reviews book={book} onChanged={reload} />

      {related.data?.books?.length > 0 && (
        <section aria-labelledby="related-h" style={{ marginTop: 40 }}>
          <h2 id="related-h">Readers also liked</h2>
          <ul className="book-grid">
            {related.data.books.map((b) => (
              <BookCard key={b._id} book={b} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
