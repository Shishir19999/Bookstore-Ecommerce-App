import { Link } from 'react-router-dom'
import { useFetch, useTitle } from '../hooks'
import { Parallax, Reveal } from '../ui/Motion'
import Cover from '../ui/Cover'
import BookCard from '../components/ProductItem'
import { ErrorState, GridSkeleton } from '../ui/States'
import { genreHue, genrePath } from '../lib/format'

function Hero({ books }) {
  const picks = books.slice(0, 3)
  return (
    <section className="hero" aria-labelledby="hero-title">
      <Parallax speed={0.18} className="plx-a" />
      <Parallax speed={0.32} className="plx-b">
        {[0, 1, 2, 3].map((i) => (
          <svg key={i} viewBox="0 0 40 60" aria-hidden="true" style={{ marginTop: i % 2 ? 90 : -70 }}>
            <rect x="4" y="4" width="32" height="52" rx="3" />
            <path d="M10 16h20M10 24h20M10 32h12" />
          </svg>
        ))}
      </Parallax>
      <div className="container hero-in">
        <Reveal>
          <p className="eyebrow">Independent bookshop</p>
          <h1 id="hero-title">Your next favourite book is waiting.</h1>
          <p>Read a preview chapter, build a reading list and shop bestsellers, new arrivals and quiet classics across every genre.</p>
          <div className="row">
            <Link to="/books" className="btn btn-primary">Browse all books</Link>
            <Link to="/genres" className="btn">Explore genres</Link>
          </div>
        </Reveal>
        <Reveal className="hero-books" delay={2}>
          {picks.map((b) => (
            <Link key={b._id} to={`/books/${b._id}`} aria-label={b.title}>
              <Cover book={b} eager />
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

function GenreTile({ genre, i }) {
  const h = genreHue(genre.name)
  return (
    <Reveal as="li" delay={i % 4} style={{ listStyle: 'none' }}>
      <Link
        to={genrePath(genre.name)}
        className="genre-tile"
        style={{ background: `linear-gradient(135deg, hsl(${h} 52% 30%), hsl(${(h + 40) % 360} 55% 18%))` }}
      >
        <Parallax speed={0.12 + (i % 3) * 0.05}>
          <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
            <circle cx={150 - (i % 3) * 30} cy="40" r="60" fill={`hsla(${h} 80% 80% / .14)`} />
            <circle cx={30 + (i % 4) * 20} cy="110" r="46" fill={`hsla(${h} 80% 80% / .1)`} />
          </svg>
        </Parallax>
        <div>
          <strong>{genre.name}</strong>
          <span>{genre.count} book{genre.count === 1 ? '' : 's'}</span>
        </div>
      </Link>
    </Reveal>
  )
}

export default function Home() {
  useTitle('')
  const { data, error, loading, reload } = useFetch('/api/books/featured')

  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading || !data)
    return (
      <div className="container section">
        <GridSkeleton count={4} />
      </div>
    )

  return (
    <>
      <Hero books={data.bestsellers} />

      <section className="container section" aria-labelledby="genres-h">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">Browse by genre</p>
            <h2 id="genres-h">Find your shelf</h2>
          </div>
          <Link to="/genres">All genres</Link>
        </Reveal>
        <ul className="genre-grid" style={{ margin: 0, padding: 0 }}>
          {data.genres.map((g, i) => (
            <GenreTile key={g.name} genre={g} i={i} />
          ))}
        </ul>
      </section>

      <section className="band" aria-labelledby="best-h">
        <Parallax speed={0.1} />
        <div className="container section">
          <Reveal className="section-head">
            <div>
              <p className="eyebrow">What everyone is reading</p>
              <h2 id="best-h">Bestsellers</h2>
            </div>
            <Link to="/books?sort=bestselling">See all bestsellers</Link>
          </Reveal>
          <Reveal delay={1}>
            <ul className="strip" style={{ margin: 0, listStyle: 'none' }}>
              {data.bestsellers.map((b, i) => (
                <BookCard key={b._id} book={b} badge={`#${i + 1}`} />
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="container section" aria-labelledby="new-h">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">Just landed</p>
            <h2 id="new-h">New arrivals</h2>
          </div>
          <Link to="/books?sort=newest">See all new books</Link>
        </Reveal>
        <ul className="book-grid">
          {data.newArrivals.map((b) => (
            <BookCard key={b._id} book={b} />
          ))}
        </ul>
      </section>

      <section className="container section" aria-label="Why shop with us">
        <div className="perks">
          {[
            ['Read before you buy', 'Every book has a preview excerpt, so you can sample the first pages.'],
            ['Your reading list', 'Save books as want to read, reading or finished and track your year.'],
            ['Honest reviews', 'Ratings and reviews come from real readers of each title.'],
          ].map(([t, d], i) => (
            <Reveal key={t} delay={i} className="card perk">
              <div>
                <h3>{t}</h3>
                <p className="muted" style={{ margin: 0 }}>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
