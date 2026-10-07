import { useParams } from 'react-router-dom'
import { useFetch, useTitle } from '../hooks'
import BookCard from '../components/ProductItem'
import { ErrorState, GridSkeleton } from '../ui/States'
import { Stars } from '../ui/Stars'
import { Link } from 'react-router-dom'
import { genrePath } from '../lib/format'

export default function Author() {
  const { name } = useParams()
  const { data, error, loading, reload } = useFetch(`/api/books/author/${encodeURIComponent(name)}`)
  useTitle(data?.author || name)

  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Author not found' : undefined} message={error} onRetry={/not found/i.test(error) ? undefined : reload} /></div>
  if (loading || !data) return <div className="container page"><GridSkeleton count={4} /></div>

  const { author, books, stats } = data
  return (
    <div className="container page">
      <header className="card" style={{ marginBottom: 28 }}>
        <p className="eyebrow">Author</p>
        <h1 style={{ marginBottom: 8 }}>{author}</h1>
        <div className="meta">
          <span>{stats.count} book{stats.count === 1 ? '' : 's'}</span>
          {stats.avgRating > 0 && <Stars value={stats.avgRating} />}
          {stats.avgRating > 0 && <span>{stats.avgRating.toFixed(1)} average rating</span>}
          <span>{stats.sold} copies sold</span>
        </div>
        <div className="row">
          {stats.genres.map((g) => (
            <Link key={g} className="chip" to={genrePath(g)}>{g}</Link>
          ))}
        </div>
      </header>
      <h2>Books by {author}</h2>
      <ul className="book-grid">
        {books.map((b) => (
          <BookCard key={b._id} book={b} />
        ))}
      </ul>
    </div>
  )
}
