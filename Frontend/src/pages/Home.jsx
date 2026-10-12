import { Link } from 'react-router-dom'
import { useAuth, useFetch, useTitle } from '../hooks'
import { Parallax, Reveal } from '../ui/Motion'
import Cover from '../ui/Cover'
import BookCard from '../components/ProductItem'
import { ErrorState, GridSkeleton } from '../ui/States'
import { fmtDay, fmtTime, genreHue, genrePath, money } from '../lib/format'
import { getRecent } from '../lib/storage'

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
          <p className="eyebrow">A bookshop for readers</p>
          <h1 id="hero-title">Read it here. Keep it forever.</h1>
          <p>Sample any e-book in your browser, listen to an audiobook, track your reading year and join a club. Print, digital and audio, all in one shop.</p>
          <div className="row">
            <Link to="/books" className="btn btn-primary">Browse all books</Link>
            <Link to="/books?format=ebook" className="btn">Try a free e-book sample</Link>
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
      <Link to={genrePath(genre.name)} className="genre-tile" style={{ background: `linear-gradient(135deg, hsl(${h} 52% 30%), hsl(${(h + 40) % 360} 55% 18%))` }}>
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

function Strip({ id, eyebrow, title, to, link, books, badge }) {
  if (!books?.length) return null
  return (
    <section className="container section" aria-labelledby={id}>
      <Reveal className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
        {to && <Link to={to}>{link}</Link>}
      </Reveal>
      <Reveal delay={1}>
        <ul className="strip" style={{ margin: 0, listStyle: 'none' }}>
          {books.map((b, i) => <BookCard key={b._id} book={b} badge={badge?.(i)} />)}
        </ul>
      </Reveal>
    </section>
  )
}

function Personal({ user }) {
  const rec = useFetch('/api/me/recommendations', { enabled: !!user })
  const stats = useFetch('/api/me/stats', { enabled: !!user })
  if (!user) return null
  const reading = stats.data?.reading || []
  return (
    <>
      {(reading.length > 0 || stats.data?.goal) && (
        <section className="container section" aria-labelledby="mine-h">
          <Reveal className="section-head">
            <div><p className="eyebrow">Welcome back, {user.name.split(' ')[0]}</p><h2 id="mine-h">Your reading</h2></div>
            <Link to="/reading">Reading life</Link>
          </Reveal>
          <div className="home-mine">
            {stats.data?.goal && (
              <Link to="/reading" className="card mini-goal">
                <strong>{stats.data.goal.finished} of {stats.data.goal.target}</strong>
                <span className="small muted">books in {stats.data.goal.year}</span>
                <div className="meter" aria-hidden="true"><i style={{ width: `${stats.data.goal.pct}%` }} /></div>
                <span className="small">{stats.data.streak.current > 0 ? `${stats.data.streak.current}-day reading streak` : 'Start a streak today'}</span>
              </Link>
            )}
            {reading.map((e) => (
              <Link key={e.book._id} to={`/books/${e.book._id}`} className="card mini-reading">
                <div style={{ width: 54 }}><Cover book={e.book} /></div>
                <div><strong className="book-title">{e.book.title}</strong><span className="small muted">Currently reading</span></div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {rec.data?.sections.map((s, i) => (
        <Strip key={i} id={`rec-${i}`} eyebrow="Picked for you" title={s.kind === 'follow' ? 'New from authors you follow' : `Because you ${s.kind === 'purchased' ? 'bought' : s.kind === 'reading' ? 'are reading' : 'read'} ${s.because?.title}`} books={s.books} />
      ))}
    </>
  )
}

function Recent() {
  const ids = getRecent()
  const { data } = useFetch(`/api/books/by-ids?ids=${ids.join(',')}`, { enabled: ids.length > 0 })
  return <Strip id="recent-h" eyebrow="Pick up where you left off" title="Recently viewed" books={data?.books} />
}

export default function Home() {
  useTitle('')
  const { user } = useAuth()
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
      <Personal user={user} />
      <section className="container section" aria-labelledby="genres-h">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">Browse by genre</p>
            <h2 id="genres-h">Find your shelf</h2>
          </div>
          <Link to="/genres">All genres</Link>
        </Reveal>
        <ul className="genre-grid" style={{ margin: 0, padding: 0 }}>
          {data.genres.map((g, i) => <GenreTile key={g.name} genre={g} i={i} />)}
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
              {data.bestsellers.map((b, i) => <BookCard key={b._id} book={b} badge={`#${i + 1}`} />)}
            </ul>
          </Reveal>
        </div>
      </section>
      <Strip id="soon-h" eyebrow="Reserve yours" title="Coming soon: pre-order" to="/books?preorder=1" link="All pre-orders" books={data.comingSoon} />
      {data.collections.length > 0 && (
        <section className="container section" aria-labelledby="col-h">
          <Reveal className="section-head">
            <div><p className="eyebrow">Curated by the shop team</p><h2 id="col-h">Collections</h2></div>
            <Link to="/collections">All collections, series and box sets</Link>
          </Reveal>
          <ul className="col-grid">
            {data.collections.map((c, i) => (
              <Reveal as="li" key={c._id} delay={i % 4} style={{ listStyle: 'none' }}>
                <Link to={`/collections/${c.slug}`} className="card col-card">
                  <strong className="book-title">{c.title}</strong>
                  <span className="small muted">{c.blurb}</span>
                  <span className="small">{c.bookIds.length} books</span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </section>
      )}
      <Strip id="new-h" eyebrow="Just landed" title="New arrivals" to="/books?sort=newest" link="See all new books" books={data.newArrivals} />
      <section className="container section" aria-labelledby="comm-h">
        <Reveal className="section-head">
          <div><p className="eyebrow">Read together</p><h2 id="comm-h">Clubs and events</h2></div>
          <Link to="/clubs">Find a book club</Link>
        </Reveal>
        <div className="two-col">
          <div className="stack">
            {data.events.map((e) => (
              <Link key={e._id} to="/events" className="card event-mini">
                <span className="date-chip" aria-hidden="true"><b>{new Date(e.startsAt).getDate()}</b>{new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short' })}</span>
                <span><strong>{e.title}</strong><br /><span className="small muted">{e.author} &middot; {fmtDay(e.startsAt)}, {fmtTime(e.startsAt)} &middot; {e.online ? 'Online' : 'In store'}</span></span>
              </Link>
            ))}
          </div>
          <div className="stack">
            {data.clubs.map((c) => (
              <Link key={c._id} to={`/clubs/${c._id}`} className="card event-mini">
                <span className="date-chip" aria-hidden="true"><b>{c.members}</b>readers</span>
                <span><strong>{c.name}</strong><br /><span className="small muted">{c.pick ? 'This month: ' + (c.pick.book?.title || 'a mystery pick') : c.description}</span></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="container section" aria-label="Gift cards and rewards">
        <Reveal className="card gift-promo">
          <div>
            <p className="eyebrow">Give a story</p>
            <h2>Gift cards from {money(10)}</h2>
            <p className="muted">Instant delivery with a personal message. Earn reward points on every order and unlock free shipping at Gold.</p>
          </div>
          <div className="row"><Link className="btn btn-primary" to="/gift-cards">Send a gift card</Link><Link className="btn" to="/account">See rewards</Link></div>
        </Reveal>
      </section>
      <Recent />
      <section className="container section" aria-label="Why shop with us">
        <div className="perks">
          {[
            ['Read before you buy', 'Every e-book has a free sample you can read in the browser, with font controls, highlights and notes.'],
            ['Your reading year', 'Set a goal, watch the progress ring fill and keep your reading streak alive.'],
            ['Print, digital, audio', 'Choose paperback, hardcover, e-book or audiobook and compare the editions side by side.'],
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
