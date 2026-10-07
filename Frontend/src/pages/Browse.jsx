import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFetch, useTitle } from '../hooks'
import BookCard from '../components/ProductItem'
import { EmptyState, ErrorState, GridSkeleton } from '../ui/States'
import { SORT_OPTIONS, money } from '../lib/format'

const PAGE_SIZE = 12
const RATINGS = [4, 3, 2]

// All filters live in the URL (?search=&genre=&language=&minPrice=&maxPrice=&minRating=&inStock=&sort=&page=)
// so a filtered view can be bookmarked, shared and survives a refresh.
export default function Browse() {
  const [params, setParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const get = (k) => params.get(k) || ''
  const search = get('search')
  const genre = get('genre')
  const sort = get('sort') || (search ? 'title' : 'bestselling')
  const page = Math.max(parseInt(get('page'), 10) || 1, 1)

  const apiParams = new URLSearchParams(params)
  apiParams.set('limit', PAGE_SIZE)
  apiParams.set('sort', sort)
  apiParams.set('page', page)
  const { data, error, loading, reload } = useFetch(`/api/books?${apiParams}`)

  useTitle(genre ? genre : search ? `Search: ${search}` : 'All books')

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === null || v === undefined || v === false) next.delete(k)
      else next.set(k, v === true ? '1' : v)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Price inputs are applied on blur/Enter so typing does not refetch on each keystroke.
  const urlMin = get('minPrice')
  const urlMax = get('maxPrice')
  const [draft, setDraft] = useState(null)
  const price = draft ?? { min: urlMin, max: urlMax }
  const setPrice = setDraft
  const applyPrice = (e) => {
    e?.preventDefault()
    setDraft(null)
    update({ minPrice: price.min, maxPrice: price.max })
  }

  const chips = []
  if (search) chips.push(['search', `Search: ${search}`])
  if (genre) chips.push(['genre', genre])
  if (get('language')) chips.push(['language', get('language')])
  if (urlMin) chips.push(['minPrice', `From ${money(urlMin)}`])
  if (urlMax) chips.push(['maxPrice', `Up to ${money(urlMax)}`])
  if (get('minRating')) chips.push(['minRating', `${get('minRating')}+ stars`])
  if (get('inStock')) chips.push(['inStock', 'In stock'])

  const facets = data
  const heading = genre || (search ? `Results for "${search}"` : 'All books')

  return (
    <div className="container page">
      <div className="toolbar">
        <div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.3rem)', marginBottom: 2 }}>{heading}</h1>
          <p className="muted small" style={{ margin: 0 }} aria-live="polite">{data ? `${data.total} book${data.total === 1 ? '' : 's'}` : 'Loading...'}</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            Filters{chips.length ? ` (${chips.length})` : ''}
          </button>
          <label className="row small" style={{ gap: 6 }}>
            Sort by
            <select className="input" style={{ width: 'auto', minHeight: 36 }} value={sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="active-filters">
          {chips.map(([k, label]) => (
            <button key={k} type="button" className="chip on" onClick={() => update({ [k]: '', ...(k === 'minPrice' ? {} : {}) })} aria-label={`Remove filter ${label}`}>
              {label} &times;
            </button>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(sort !== 'bestselling' ? { sort } : {}, { replace: true })}>Clear all</button>
        </div>
      )}

      <div className="browse">
        <aside className={`filters card ${showFilters ? 'open' : ''}`} aria-label="Filters">
          <fieldset>
            <legend>Genre</legend>
            <div className="chip-list">
              {(facets?.genres || (genre ? [genre] : [])).map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={genre === g} onClick={() => update({ genre: genre === g ? '' : g })}>{g}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Language</legend>
            <select className="input" aria-label="Language" value={get('language')} onChange={(e) => update({ language: e.target.value })}>
              <option value="">Any language</option>
              {(facets?.languages || []).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </fieldset>
          <form onSubmit={applyPrice}>
            <fieldset>
              <legend>Price</legend>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" type="number" min="0" inputMode="decimal" placeholder={facets ? String(facets.priceRange.min) : 'Min'} aria-label="Minimum price" value={price.min} onChange={(e) => setPrice({ ...price, min: e.target.value })} onBlur={applyPrice} />
                <span aria-hidden="true">-</span>
                <input className="input" type="number" min="0" inputMode="decimal" placeholder={facets ? String(facets.priceRange.max) : 'Max'} aria-label="Maximum price" value={price.max} onChange={(e) => setPrice({ ...price, max: e.target.value })} onBlur={applyPrice} />
              </div>
              <button type="submit" className="sr-only">Apply price</button>
            </fieldset>
          </form>
          <fieldset>
            <legend>Rating</legend>
            <div className="chip-list">
              {RATINGS.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={get('minRating') === String(r)} onClick={() => update({ minRating: get('minRating') === String(r) ? '' : r })}>{r}+ stars</button>
              ))}
            </div>
          </fieldset>
          <label className="row">
            <input type="checkbox" checked={!!get('inStock')} onChange={(e) => update({ inStock: e.target.checked })} /> In stock only
          </label>
        </aside>

        <section aria-label="Results">
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            <GridSkeleton count={PAGE_SIZE} />
          ) : data.books.length === 0 ? (
            <EmptyState title="No books match" text="Try removing a filter or searching for something else.">
              <button type="button" className="btn btn-primary" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
            </EmptyState>
          ) : (
            <>
              <ul className="book-grid" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
                {data.books.map((b) => (
                  <BookCard key={b._id} book={b} />
                ))}
              </ul>
              {data.pages > 1 && (
                <nav className="pager" aria-label="Pagination">
                  <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button>
                  <span className="small">Page {data.page} of {data.pages}</span>
                  <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>Next</button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
