import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useCart, useFetch, useTitle, useToast } from '../hooks'
import BookCard from '../components/ProductItem'
import Cover from '../ui/Cover'
import { EmptyState, ErrorState, GridSkeleton, PageSkeleton } from '../ui/States'
import { Panel, Tabs } from '../ui/Parts'
import { authorPath, money, seriesPath } from '../lib/format'

const CoverStack = ({ books }) => (
  <div className="cover-stack" aria-hidden="true">
    {books.slice(0, 3).map((b, i) => <span key={b._id} style={{ '--i': i }}><Cover book={b} /></span>)}
  </div>
)

// /collections: curated collections, series and box sets in one place.
export function Collections() {
  useTitle('Collections and box sets')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'collections'
  const cols = useFetch('/api/collections')
  const series = useFetch('/api/series')
  const bundles = useFetch('/api/bundles')
  const tabs = [
    { id: 'collections', label: 'Collections', count: cols.data?.collections.length },
    { id: 'series', label: 'Series', count: series.data?.series.length },
    { id: 'bundles', label: 'Box sets', count: bundles.data?.bundles.length },
  ]
  const err = cols.error || series.error || bundles.error
  return (
    <div className="container page">
      <p className="eyebrow">Discover</p>
      <h1>Collections, series and box sets</h1>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} label="Browse by" />
      {err && <ErrorState message={err} />}
      <Panel id={tab}>
        {tab === 'collections' && (
          <ul className="col-grid" style={{ marginTop: 18 }}>
            {(cols.data?.collections || []).map((c) => (
              <li key={c._id} style={{ listStyle: 'none' }}>
                <Link to={`/collections/${c.slug}`} className="card col-card">
                  <CoverStack books={c.covers} />
                  <strong className="book-title">{c.title}</strong>
                  <span className="small muted">{c.blurb}</span>
                  <span className="small">{c.count} books</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {tab === 'series' && (
          <ul className="col-grid" style={{ marginTop: 18 }}>
            {(series.data?.series || []).map((s) => (
              <li key={s.slug} style={{ listStyle: 'none' }}>
                <Link to={seriesPath(s)} className="card col-card">
                  <CoverStack books={s.books} />
                  <strong className="book-title">{s.name}</strong>
                  <span className="small muted">by {s.author} &middot; {s.count} books</span>
                  <span className="small">{s.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {tab === 'bundles' && (
          <ul className="col-grid" style={{ marginTop: 18 }}>
            {(bundles.data?.bundles || []).map((b) => (
              <li key={b._id} style={{ listStyle: 'none' }}>
                <Link to={`/bundles/${b.slug}`} className="card col-card">
                  <CoverStack books={b.books} />
                  <strong className="book-title">{b.title}</strong>
                  <span className="small muted">{b.description}</span>
                  <span><strong>{money(b.price)}</strong> <s className="muted small">{money(b.listPrice)}</s> <span className="pill pill-success">Save {money(b.savings)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function CollectionDetail() {
  const { slug } = useParams()
  const { data, error, reload } = useFetch(`/api/collections/${slug}`)
  useTitle(data?.collection.title)
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Collection not found' : undefined} message={error} onRetry={reload} /></div>
  if (!data) return <div className="container page"><GridSkeleton count={4} /></div>
  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 12 }}><Link to="/collections">Collections</Link> / {data.collection.title}</nav>
      <header className="card" style={{ marginBottom: 24 }}>
        <p className="eyebrow">Collection</p>
        <h1 style={{ marginBottom: 6 }}>{data.collection.title}</h1>
        <p className="muted" style={{ margin: 0 }}>{data.collection.blurb} {data.books.length} books.</p>
      </header>
      {data.books.length === 0 ? <EmptyState title="Nothing here yet" /> : <ul className="book-grid">{data.books.map((b) => <BookCard key={b._id} book={b} />)}</ul>}
    </div>
  )
}

export function SeriesDetail() {
  const { slug } = useParams()
  const { data, error, reload } = useFetch(`/api/series/${slug}`)
  const { addToCart } = useCart()
  const toast = useToast()
  useTitle(data?.series.name)
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Series not found' : undefined} message={error} onRetry={reload} /></div>
  if (!data) return <div className="container page"><GridSkeleton count={4} /></div>
  const { series, books, bundle } = data
  const buyable = books.filter((b) => !b.upcoming)
  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 12 }}><Link to="/collections?tab=series">Series</Link> / {series.name}</nav>
      <header className="card" style={{ marginBottom: 24 }}>
        <p className="eyebrow">Series</p>
        <h1 style={{ marginBottom: 6 }}>{series.name}</h1>
        <p className="muted">by <Link to={authorPath(series.author)}>{series.author}</Link> &middot; {books.length} books</p>
        {series.description && <p>{series.description}</p>}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => { buyable.forEach((b) => addToCart(b, 1, 'paperback')); toast.success(`Added ${buyable.length} books to your cart.`) }}>Add the {buyable.length} available books</button>
          {bundle && <Link className="btn" to={`/bundles/${bundle.slug}`}>Box set: save {bundle.discountPct}%</Link>}
        </div>
      </header>
      <ol className="series-list">
        {books.map((b) => (
          <li key={b._id}>
            <span className="series-num" aria-label={`Book ${b.series.number}`}>{b.series.number}</span>
            <ul className="book-grid" style={{ gridTemplateColumns: 'minmax(0, 200px)' }}><BookCard book={b} /></ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function BundleDetail() {
  const { slug } = useParams()
  const { data: b, error, reload } = useFetch(`/api/bundles/${slug}`)
  const { addBundle } = useCart()
  const toast = useToast()
  const [added, setAdded] = useState(false)
  useTitle(b?.title)
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Box set not found' : undefined} message={error} onRetry={reload} /></div>
  if (!b) return <PageSkeleton />
  const unavailable = b.books.some((x) => x.formats.find((f) => f.type === 'paperback')?.stock < 1)
  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 12 }}><Link to="/collections?tab=bundles">Box sets</Link> / {b.title}</nav>
      <header className="card" style={{ marginBottom: 24 }}>
        <p className="eyebrow">Box set &middot; save {b.discountPct}%</p>
        <h1 style={{ marginBottom: 6 }}>{b.title}</h1>
        <p className="muted">{b.description}</p>
        <div className="buy" style={{ margin: '8px 0 0' }}>
          <span className="price">{money(b.price)}</span>
          <s className="muted">{money(b.listPrice)}</s>
          <span className="pill pill-success">You save {money(b.savings)}</span>
          <button type="button" className="btn btn-primary" disabled={unavailable} onClick={() => { addBundle(b); setAdded(true); toast.success(`Added ${b.books.length} books (paperback) to your cart; the box set discount applies at checkout.`) }}>
            {unavailable ? 'A book is out of stock' : 'Add the box set to cart'}
          </button>
          {added && <Link to="/cart" className="btn">Go to cart</Link>}
        </div>
        <p className="hint">The discount is taken off automatically once all {b.books.length} paperbacks are in your cart.</p>
      </header>
      <ul className="book-grid">{b.books.map((x) => <BookCard key={x._id} book={x} />)}</ul>
    </div>
  )
}
