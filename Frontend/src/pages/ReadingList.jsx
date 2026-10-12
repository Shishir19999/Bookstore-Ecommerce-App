import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useCart, useFetch, useReading, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { READING_STATUSES, appUrl, authorPath, fmtDate, money } from '../lib/format'
import { anyBuyable, defaultFormat } from '../shared/rules.mjs'

function ShareBox() {
  const toast = useToast()
  const { data, reload } = useFetch('/api/me/wishlist/share')
  const [busy, setBusy] = useState(false)
  const link = data?.token ? appUrl(`/wishlist/${data.token}`) : ''
  const set = async (enabled) => {
    setBusy(true)
    try {
      await api('/api/me/wishlist/share', { method: 'POST', body: { enabled } })
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied.')
    } catch {
      toast.info('Select the link and copy it.')
    }
  }
  return (
    <section className="card" aria-labelledby="share-h" style={{ marginBottom: 18 }}>
      <h2 id="share-h" style={{ fontSize: '1.15rem' }}>Share your wish list</h2>
      {data?.enabled ? (
        <>
          <p className="small muted">Anyone with this link can see the books you want to read (only your first name is shown) and add them to their cart as a gift.</p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input mono small" readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-sm" onClick={copy}>Copy</button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => set(false)}>Stop sharing</button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">Create a private link so friends and family know what you would like to read next.</p>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => set(true)}>Create share link</button>
        </>
      )}
    </section>
  )
}

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
      <ShareBox />
      {list.length === 0 ? (
        <EmptyState title="Your reading list is empty" text="Tap the heart on any book to save it for later." to="/books" action="Find a book" />
      ) : shown.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="card" style={{ listStyle: 'none', margin: 0 }}>
          {shown.map(({ book, status, finishedAt }) => {
            const def = defaultFormat(book)
            return (
              <li className="line" key={book._id}>
                <Link to={`/books/${book._id}`}><Cover book={book} /></Link>
                <div>
                  <Link to={`/books/${book._id}`} className="book-title">{book.title}</Link>
                  <Link to={authorPath(book.author)} className="book-author">{book.author}</Link>
                  {status === 'finished' && finishedAt && <div className="small muted">Finished {fmtDate(finishedAt)}</div>}
                  <div className="seg" style={{ marginTop: 8 }} role="group" aria-label={`Status of ${book.title}`}>
                    {READING_STATUSES.map((s) => (
                      <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(book, s.value)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <div className="line-actions">
                  <strong>{money(def.price)}</strong>
                  {anyBuyable(book) && <button type="button" className="btn btn-sm" onClick={() => { addToCart(book, 1, def.type); toast.success(`Added "${book.title}" to your cart.`) }}>{book.upcoming ? 'Pre-order' : 'Add to cart'}</button>}
                  <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => setStatus(book, null)}>Remove</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Public wish list page opened from a share link.
export function SharedWishlist() {
  const { token } = useParams()
  const { user } = useAuth()
  const { addToCart } = useCart()
  const toast = useToast()
  const { data, error, loading, reload } = useFetch(`/api/shared/wishlist/${token}`)
  useTitle(data ? `${data.owner}'s wish list` : 'Wish list')
  if (error) return <div className="container page"><ErrorState title="This link is not active" message="The owner may have stopped sharing their wish list." onRetry={reload} /></div>
  if (loading || !data) return <PageSkeleton />
  return (
    <div className="container page">
      <p className="eyebrow">Wish list</p>
      <h1>{data.owner}&apos;s wish list</h1>
      <p className="muted">{data.books.length === 0 ? 'Nothing on the list right now.' : 'Books they would love to read. Add one to your cart as a gift.'}{!user && <> <Link to="/login">Log in</Link> to check out.</>}</p>
      <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {data.books.map(({ book, addedAt }) => {
          const def = defaultFormat(book)
          return (
            <li className="line" key={book._id} style={{ padding: 16 }}>
              <Link to={`/books/${book._id}`}><Cover book={book} /></Link>
              <div>
                <Link to={`/books/${book._id}`} className="book-title">{book.title}</Link>
                <Link to={authorPath(book.author)} className="book-author">{book.author}</Link>
                <div className="small muted">Added {fmtDate(addedAt)}</div>
              </div>
              <div className="line-actions">
                <strong>{money(def.price)}</strong>
                {anyBuyable(book) && <button type="button" className="btn btn-sm btn-primary" onClick={() => { addToCart(book, 1, def.type); toast.success(`Added "${book.title}" to your cart.`) }}>Gift this</button>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
