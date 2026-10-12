import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useCart, useConfirm, useFetch, useReading, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { Stars, StarInput } from '../ui/Stars'
import { ErrorState, PageSkeleton } from '../ui/States'
import { FormatIcon, Tabs, Panel } from '../ui/Parts'
import Narration from '../ui/Narration'
import BookCard from '../components/ProductItem'
import { FORMAT_LABEL, READING_STATUSES, authorPath, fmtDate, genrePath, hoursMin, money, seriesPath, timeAgo } from '../lib/format'
import { pushRecent } from '../lib/storage'
import { availability, canBuy, defaultFormat, isDigital, isPhysical } from '../shared/rules.mjs'

const LABEL = { in: 'In stock', low: 'Low stock', out: 'Out of stock', preorder: 'Pre-order', digital: 'Instant delivery' }
const PILL = { in: 'pill-success', low: 'pill-warn', out: 'pill-danger', preorder: 'pill-accent', digital: 'pill-info' }

function Spoiler({ children }) {
  const [shown, setShown] = useState(false)
  if (shown) return <>{children}</>
  return (
    <button type="button" className="spoiler" onClick={() => setShown(true)} aria-label="Spoiler hidden. Show it.">
      <span aria-hidden="true">Spoiler: click to reveal</span>
    </button>
  )
}

function Reviews({ book, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [sort, setSort] = useState('helpful')
  const { data, error, loading, reload } = useFetch(`/api/books/${book._id}/reviews?sort=${sort}`)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const reviews = data?.reviews || []
  const mine = reviews.find((r) => r.mine)
  const counts = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => r.rating === n).length)
  const max = Math.max(1, ...counts)
  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!rating) return
    setBusy(true)
    try {
      await api(`/api/books/${book._id}/reviews`, { method: 'POST', body: { rating, text, spoiler } })
      toast.success(mine ? 'Your review was updated.' : 'Thanks for your review!')
      setText('')
      setRating(0)
      setSpoiler(false)
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
  const vote = async (r) => {
    if (!user) return toast.info('Log in to mark reviews as helpful.')
    try {
      await api(`/api/reviews/${r._id}/helpful`, { method: 'POST' })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const report = async (r) => {
    if (!user) return toast.info('Log in to report a review.')
    if (!(await confirm({ title: 'Report this review?', message: 'Our team will take a look. Reports are anonymous.', confirmLabel: 'Report' }))) return
    try {
      await api(`/api/reviews/${r._id}/report`, { method: 'POST', body: { reason: 'Reported by a reader' } })
      toast.success('Thanks, the review was reported.')
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
                <label className="row small"><input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> This review contains spoilers (readers must click to reveal it)</label>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : mine ? 'Update review' : 'Post review'}</button>
                  {mine && <button type="button" className="btn btn-outline-danger" onClick={remove}>Delete my review</button>}
                </div>
              </form>
            ) : (
              <p className="alert alert-info"><Link to="/login" state={{ from: `/books/${book._id}` }}>Log in</Link> to rate and review this book.</p>
            )}
            {reviews.length > 1 && (
              <label className="row small" style={{ marginBottom: 8 }}>
                Sort reviews
                <select className="input" style={{ width: 'auto', minHeight: 34 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="helpful">Most helpful</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            )}
            {reviews.length === 0 ? (
              <p className="muted">No reviews yet. Be the first to share what you thought.</p>
            ) : (
              reviews.map((r) => (
                <article className="review" key={r._id}>
                  <div className="row between">
                    <strong>{r.name} {r.verified && <span className="pill pill-success" title="This reader bought the book here">Verified purchase</span>}</strong>
                    <span className="small muted">{fmtDate(r.createdAt)}</span>
                  </div>
                  <Stars value={r.rating} />
                  {r.hidden && <p className="alert alert-error small" style={{ marginTop: 6 }}>Hidden by staff. Only you can see this review; edit it to restore it.</p>}
                  {r.text && (r.spoiler ? <p style={{ margin: '6px 0 0' }}><span className="pill pill-warn">Spoiler</span> <Spoiler>{r.text}</Spoiler></p> : <p style={{ margin: '6px 0 0' }}>{r.text}</p>)}
                  <div className="row small" style={{ marginTop: 6 }}>
                    <button type="button" className="chip" aria-pressed={r.voted} disabled={r.mine} onClick={() => vote(r)}>{r.voted ? 'Marked helpful' : 'Helpful'} ({r.helpful})</button>
                    {!r.mine && <button type="button" className="btn btn-ghost btn-sm" onClick={() => report(r)}>Report</button>}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function QA({ book }) {
  const { user } = useAuth()
  const toast = useToast()
  const { data, error, reload } = useFetch(`/api/books/${book._id}/questions`)
  const [q, setQ] = useState('')
  const [answering, setAnswering] = useState('')
  const [answer, setAnswer] = useState('')
  const [err, setErr] = useState('')
  const ask = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api(`/api/books/${book._id}/questions`, { method: 'POST', body: { text: q } })
      setQ('')
      toast.success('Question posted.')
      reload()
    } catch (x) {
      setErr(x.message)
    }
  }
  const reply = async (e, qid) => {
    e.preventDefault()
    try {
      await api(`/api/questions/${qid}/answers`, { method: 'POST', body: { text: answer } })
      setAnswer('')
      setAnswering('')
      reload()
    } catch (x) {
      toast.error(x.message)
    }
  }
  const remove = async (qid) => {
    try {
      await api(`/api/questions/${qid}`, { method: 'DELETE' })
      reload()
    } catch (x) {
      toast.error(x.message)
    }
  }
  return (
    <section id="qa" aria-labelledby="qa-h" style={{ marginTop: 40 }}>
      <h2 id="qa-h">Questions and answers</h2>
      {error && <p className="err">{error}</p>}
      {user ? (
        <form className="row" onSubmit={ask} style={{ alignItems: 'flex-start', flexWrap: 'nowrap', marginBottom: 14 }}>
          <div className="field grow" style={{ margin: 0 }}>
            <label className="sr-only" htmlFor="ask-q">Ask a question about this book</label>
            <input id="ask-q" className="input" placeholder="Ask readers and staff a question about this book" maxLength={400} value={q} onChange={(e) => setQ(e.target.value)} aria-invalid={!!err} />
            {err && <span className="err" role="alert">{err}</span>}
          </div>
          <button className="btn btn-primary">Ask</button>
        </form>
      ) : (
        <p className="alert alert-info"><Link to="/login" state={{ from: `/books/${book._id}` }}>Log in</Link> to ask a question.</p>
      )}
      {data?.questions.length === 0 && <p className="muted">No questions yet.</p>}
      {data?.questions.map((x) => (
        <article key={x._id} className="qa-item">
          <p style={{ margin: 0 }}><strong>Q:</strong> {x.text} <span className="small muted">{x.name}, {timeAgo(x.createdAt)}</span></p>
          {x.answers.map((a) => (
            <p key={a._id} className="qa-answer"><strong>A:</strong> {a.text} <span className="small muted">{a.name}{a.role !== 'user' && <span className="pill pill-accent" style={{ marginLeft: 6 }}>{a.role === 'admin' ? 'Admin' : 'Staff'}</span>}</span></p>
          ))}
          <div className="row small">
            {user && answering !== x._id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnswering(x._id)}>Answer</button>}
            {user && (user.role !== 'user' || x.name === user.name) && <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => remove(x._id)}>Remove</button>}
          </div>
          {answering === x._id && (
            <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => reply(e, x._id)}>
              <label className="sr-only" htmlFor={`ans-${x._id}`}>Your answer</label>
              <input id={`ans-${x._id}`} className="input" placeholder="Share what you know" maxLength={800} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
              <button className="btn btn-sm btn-primary">Reply</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAnswering('')}>Cancel</button>
            </form>
          )}
        </article>
      ))}
    </section>
  )
}

function Compare({ book, owned }) {
  return (
    <section aria-labelledby="cmp-h" style={{ marginTop: 36 }}>
      <h2 id="cmp-h">Compare editions</h2>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="table">
          <caption className="sr-only">Editions of {book.title}</caption>
          <thead><tr><th scope="col">Edition</th><th scope="col" className="num">Price</th><th scope="col">Delivery</th><th scope="col">Length</th><th scope="col">ISBN</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {book.formats.map((f) => {
              const a = availability(book, f.type)
              return (
                <tr key={f.type}>
                  <th scope="row"><FormatIcon type={f.type} /> {FORMAT_LABEL[f.type]}{owned.includes(f.type) && <span className="pill pill-success" style={{ marginLeft: 6 }}>Owned</span>}</th>
                  <td className="num">{money(f.price)}</td>
                  <td>{isDigital(f.type) ? (a.state === 'preorder' ? `Pre-order, ${fmtDate(book.publishedAt)}` : 'Instant, in your library') : a.state === 'preorder' ? `Pre-order, ships ${fmtDate(book.publishedAt)}` : a.state === 'out' ? 'Out of stock' : `Ships in 1-2 days${a.state === 'low' ? ` (${a.stock} left)` : ''}`}</td>
                  <td>{f.type === 'audiobook' ? (f.minutes ? hoursMin(f.minutes) : '-') : book.pages ? `${book.pages} pages` : '-'}</td>
                  <td className="mono small">{f.isbn || '-'}</td>
                  <td className="small">{f.edition || (f.narrator ? `Narrated by ${f.narrator}` : f.type === 'ebook' ? 'Read in browser, download text' : '-')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function BookDetail() {
  const { id } = useParams()
  return <BookPage key={id} id={id} />
}

function BookPage({ id }) {
  const { user } = useAuth()
  const { data: book, error, reload } = useFetch(`/api/books/${id}`)
  const related = useFetch(`/api/books/${id}/related`)
  const extras = useFetch(`/api/books/${id}/extras`)
  const { addToCart } = useCart()
  const { statusOf, setStatus } = useReading()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const [format, setFormat] = useState('')
  const [full, setFull] = useState(false)
  const [tab, setTab] = useState('about')
  const [sample, setSample] = useState(null)
  const [alertBusy, setAlertBusy] = useState(false)
  useTitle(book?.title)
  useEffect(() => {
    pushRecent(id)
  }, [id])

  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Book not found' : undefined} message={error} onRetry={/not found/i.test(error) ? undefined : reload} /></div>
  if (!book || book._id !== id) return <PageSkeleton />
  const ex = extras.data || { series: [], bundles: [], collections: [], owned: [], alerts: [] }
  const f = book.formats.find((x) => x.type === format) || defaultFormat(book)
  const av = availability(book, f.type)
  const owns = ex.owned.includes(f.type)
  const buyable = canBuy(book, f.type) && !(isDigital(f.type) && owns)
  const max = isPhysical(f.type) ? Math.min(f.stock, 20) : 1
  const status = statusOf(book._id)
  const alerted = ex.alerts.includes(f.type)
  const hasSample = book.formats.some((x) => x.type === 'ebook') && !book.upcoming
  const toggleAlert = async () => {
    if (!user) return toast.info('Log in to get a back-in-stock alert.')
    setAlertBusy(true)
    try {
      const r = await api(`/api/books/${book._id}/notify`, { method: 'POST', body: { format: f.type } })
      toast.success(r.subscribed ? 'We will let you know when it is back.' : 'Alert removed.')
      extras.reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAlertBusy(false)
    }
  }
  const loadSample = async () => {
    try {
      const t = await api(`/api/books/${book._id}/text?format=audiobook`)
      setSample(t.chapters[0].paragraphs)
    } catch (err) {
      toast.error(err.message)
    }
  }
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied.')
    } catch {
      toast.info('Copy the address from your browser to share this book.')
    }
  }
  const tabs = [
    { id: 'about', label: 'About' },
    { id: 'editions', label: 'Editions', count: book.formats.length },
    { id: 'qa', label: 'Questions' },
  ]
  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
        <Link to="/books">Books</Link> / {book.genre && <><Link to={genrePath(book.genre)}>{book.genre}</Link> / </>}{book.title}
      </nav>
      <div className="detail">
        <Cover book={book} eager />
        <div>
          {book.series && <p className="eyebrow" style={{ marginBottom: 4 }}><Link to={seriesPath(book.series)}>Book {book.series.number} of {book.series.name}</Link></p>}
          <h1>{book.title}</h1>
          <p style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>by <Link to={authorPath(book.author)}>{book.author}</Link></p>
          <Stars value={book.rating} count={book.numReviews} />
          <div className="meta" style={{ marginTop: 12 }}>
            {book.genre && <span>{book.genre}</span>}
            {book.language && <span>{book.language}</span>}
            {book.pages > 0 && <span>{book.pages} pages</span>}
            {book.publisher && <span>{book.publisher}</span>}
            <span>{book.upcoming ? 'Releases' : 'Published'} {fmtDate(book.publishedAt)}</span>
          </div>
          <p>{book.description}</p>

          <fieldset className="format-picker">
            <legend>Choose an edition</legend>
            <div className="format-grid">
              {book.formats.map((x) => {
                const a = availability(book, x.type)
                return (
                  <label key={x.type} className={`format-card ${f.type === x.type ? 'on' : ''}`}>
                    <input type="radio" name="format" value={x.type} checked={f.type === x.type} onChange={() => (setFormat(x.type), setQty(1))} />
                    <span className="fc-head"><FormatIcon type={x.type} /> {FORMAT_LABEL[x.type]}</span>
                    <span className="fc-price">{money(x.price)}</span>
                    <span className={`pill ${PILL[a.state] || ''}`}>{a.state === 'low' ? a.label : LABEL[a.state]}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="buy">
            <span className="price">{money(f.price)}</span>
            {owns && isDigital(f.type) ? (
              <>
                <span className="pill pill-success">You own this {FORMAT_LABEL[f.type].toLowerCase()}</span>
                <Link className="btn btn-primary" to={f.type === 'ebook' ? `/read/${book._id}` : `/listen/${book._id}`}>{f.type === 'ebook' ? 'Read now' : 'Listen now'}</Link>
              </>
            ) : buyable ? (
              <>
                {isPhysical(f.type) && (
                  <div className="qty" role="group" aria-label="Quantity">
                    <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>-</button>
                    <output aria-live="polite">{qty}</output>
                    <button type="button" aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(qty + 1)}>+</button>
                  </div>
                )}
                <button type="button" className="btn btn-primary" onClick={() => { addToCart(book, qty, f.type); toast.success(`Added ${isPhysical(f.type) ? `${qty} x ` : ''}"${book.title}" (${FORMAT_LABEL[f.type]}) to your cart.`) }}>
                  {av.state === 'preorder' ? 'Pre-order' : 'Add to cart'}
                </button>
              </>
            ) : (
              <>
                <span className="pill pill-danger">{av.label}</span>
                {isPhysical(f.type) && <button type="button" className="btn" disabled={alertBusy} aria-pressed={alerted} onClick={toggleAlert}>{alerted ? 'Alert on: cancel' : 'Notify me when back in stock'}</button>}
              </>
            )}
          </div>
          <p className="small muted" style={{ marginTop: -8 }}>
            {av.state === 'preorder' ? `Releases ${fmtDate(book.publishedAt)}. ${isPhysical(f.type) ? 'Ships on release day.' : 'Appears in your library on release day.'} ` : ''}
            {av.state === 'low' ? `Only ${av.stock} left. ` : ''}
            {isPhysical(f.type) ? 'Free standard shipping on printed books over the free-shipping threshold.' : ''}
          </p>

          <div className="row" style={{ gap: 8 }}>
            {hasSample && <Link className="btn btn-sm" to={`/read/${book._id}`}>Read a free sample</Link>}
            {book.formats.some((x) => x.type === 'audiobook') && !book.upcoming && (sample ? <button type="button" className="btn btn-sm" onClick={() => setSample(null)}>Hide audio sample</button> : <button type="button" className="btn btn-sm" onClick={loadSample}>Listen to a sample</button>)}
            <button type="button" className="btn btn-ghost btn-sm" onClick={share}>Copy link</button>
          </div>
          {sample && <div style={{ marginTop: 12 }}><Narration title={`${book.title} (sample)`} paragraphs={sample.slice(0, 3)} compact /></div>}

          <div className="row" role="group" aria-label="Reading list" style={{ marginTop: 14 }}>
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

      {ex.series.length > 1 && (
        <section aria-labelledby="series-h" style={{ marginTop: 36 }}>
          <div className="section-head">
            <h2 id="series-h" style={{ fontSize: '1.5rem' }}>The {book.series.name} series</h2>
            <Link to={seriesPath(book.series)}>See the whole series</Link>
          </div>
          <ol className="series-strip">
            {ex.series.map((b) => (
              <li key={b._id} className={b._id === book._id ? 'on' : ''}>
                <Link to={`/books/${b._id}`} aria-current={b._id === book._id ? 'page' : undefined}>
                  <Cover book={b} />
                  <span className="small"><strong>{b.series.number}.</strong> {b.title}{b.upcoming ? ' (pre-order)' : ''}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      {ex.bundles.length > 0 && (
        <p className="alert alert-info" style={{ marginTop: 24 }}>
          Part of {ex.bundles.map((b, i) => <span key={b._id}>{i > 0 && ', '}<Link to={`/bundles/${b.slug}`}>{b.title}</Link> ({b.discountPct}% off)</span>)}.
        </p>
      )}

      <div style={{ marginTop: 32 }}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Book information" />
        <Panel id={tab}>
          {tab === 'about' && book.excerpt && (
            <section aria-labelledby="excerpt-h" style={{ maxWidth: 720, marginTop: 18 }}>
              <h2 id="excerpt-h">Read a preview</h2>
              <div className={`excerpt ${full ? '' : 'excerpt-fade'}`}>{book.excerpt}</div>
              <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} aria-expanded={full} onClick={() => setFull(!full)}>
                {full ? 'Show less' : 'Keep reading'}
              </button>
              {ex.collections.length > 0 && <p className="small muted" style={{ marginTop: 18 }}>In collections: {ex.collections.map((c, i) => <span key={c._id}>{i > 0 && ', '}<Link to={`/collections/${c.slug}`}>{c.title}</Link></span>)}</p>}
            </section>
          )}
          {tab === 'editions' && <Compare book={book} owned={ex.owned} />}
          {tab === 'qa' && <QA book={book} />}
        </Panel>
      </div>

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
