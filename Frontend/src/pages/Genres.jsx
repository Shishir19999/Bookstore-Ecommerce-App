import { Link } from 'react-router-dom'
import { useFetch, useTitle } from '../hooks'
import { Parallax, Reveal } from '../ui/Motion'
import { ErrorState, PageSkeleton } from '../ui/States'
import { genreHue, genrePath } from '../lib/format'

const BLURBS = {
  Fantasy: 'Maps, magic and long journeys.',
  'Science Fiction': 'Futures, machines and strange new worlds.',
  Mystery: 'Locked rooms, clues and quiet detectives.',
  Romance: 'Slow burns, second chances and happy endings.',
  'Historical Fiction': 'Other centuries, vividly lived.',
  'Science & Nature': 'How the world works, explained well.',
  Technology: 'Code, systems and the people behind them.',
  Poetry: 'Short lines that stay with you.',
}

export default function Genres() {
  useTitle('Genres')
  const { data, error, loading, reload } = useFetch('/api/books/featured')
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading || !data) return <PageSkeleton />
  return (
    <div className="container page">
      <p className="eyebrow">Browse</p>
      <h1>Genres</h1>
      <ul className="genre-grid" style={{ margin: 0, padding: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {data.genres.map((g, i) => {
          const h = genreHue(g.name)
          return (
            <Reveal as="li" key={g.name} delay={i % 3} style={{ listStyle: 'none' }}>
              <Link to={genrePath(g.name)} className="genre-tile" style={{ minHeight: 170, background: `linear-gradient(135deg, hsl(${h} 52% 30%), hsl(${(h + 40) % 360} 55% 18%))` }}>
                <Parallax speed={0.1 + (i % 3) * 0.05}>
                  <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
                    <circle cx={160 - (i % 3) * 30} cy="40" r="64" fill={`hsla(${h} 80% 80% / .15)`} />
                    <circle cx={30 + (i % 4) * 25} cy="110" r="50" fill={`hsla(${h} 80% 80% / .1)`} />
                  </svg>
                </Parallax>
                <div>
                  <strong>{g.name}</strong>
                  <span>{BLURBS[g.name] || 'Browse the shelf.'} {g.count} book{g.count === 1 ? '' : 's'}.</span>
                </div>
              </Link>
            </Reveal>
          )
        })}
      </ul>
    </div>
  )
}
