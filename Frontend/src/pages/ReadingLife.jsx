import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useFetch, useReading, useTitle, useToast } from '../hooks'
import BookCard from '../components/ProductItem'
import Cover from '../ui/Cover'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { BarList, Field, Modal, Ring } from '../ui/Parts'
import { fmtDate, hoursMin, plural } from '../lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STATUS_TEXT = {
  done: 'Goal reached. Brilliant!',
  ahead: 'You are ahead of schedule.',
  'on-track': 'You are on track.',
  behind: 'A little behind, but there is time.',
}

function Heatmap({ heat }) {
  const lead = new Date(heat[0].date + 'T00:00:00Z').getUTCDay()
  const max = Math.max(30, ...heat.map((h) => h.minutes))
  const level = (m) => (m === 0 ? 0 : m < max * 0.25 ? 1 : m < max * 0.5 ? 2 : m < max * 0.75 ? 3 : 4)
  const active = heat.filter((h) => h.minutes > 0).length
  return (
    <div>
      <div className="heat" role="img" aria-label={`Reading activity for the last 12 weeks: ${active} active days`}>
        {Array.from({ length: lead }, (_, i) => <i key={`l${i}`} className="heat-cell blank" />)}
        {heat.map((h) => <i key={h.date} className={`heat-cell lv${level(h.minutes)}`} title={`${fmtDate(h.date)}: ${h.minutes ? `${Math.round(h.minutes)} min` : 'no reading'}`} />)}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>Last 12 weeks &middot; {plural(active, 'active day')}</p>
    </div>
  )
}

function GoalDialog({ open, onClose, goal, year, onSaved }) {
  const toast = useToast()
  const [books, setBooks] = useState(String(goal?.target || 24))
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    try {
      await api('/api/me/goal', { method: 'PUT', body: { year, books: Number(books) } })
      toast.success(`Goal set: ${books} books in ${year}.`)
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }
  const clear = async () => {
    await api('/api/me/goal', { method: 'DELETE' })
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={`Your ${year} reading goal`}>
      <form onSubmit={save} noValidate>
        <div className="row" style={{ marginBottom: 8 }}>
          {[12, 18, 24, 36, 52].map((n) => <button key={n} type="button" className="chip" aria-pressed={books === String(n)} onClick={() => setBooks(String(n))}>{n}</button>)}
        </div>
        <Field label="Books to read this year" type="number" min="1" max="365" value={books} onChange={(e) => setBooks(e.target.value)} error={error} />
        <div className="dialog-actions">
          {goal && <button type="button" className="btn btn-outline-danger" onClick={clear}>Remove goal</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Save goal</button>
        </div>
      </form>
    </Modal>
  )
}

export default function ReadingLife() {
  useTitle('Reading life')
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const { data, error, loading, reload } = useFetch(`/api/me/stats?year=${year}`)
  const rec = useFetch('/api/me/recommendations')
  const { setStatus } = useReading()
  const toast = useToast()
  const [goalOpen, setGoalOpen] = useState(false)
  const [mins, setMins] = useState('20')
  const log = async (e) => {
    e.preventDefault()
    try {
      await api('/api/me/activity', { method: 'POST', body: { minutes: Number(mins) } })
      toast.success('Reading session logged. Keep the streak going!')
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const finish = async (book) => {
    if (await setStatus(book, 'finished')) reload()
  }
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />
  const s = data
  const g = s.goal
  const maxMonth = Math.max(1, ...s.byMonth)
  return (
    <div className="container page">
      <div className="row between">
        <div><p className="eyebrow">Your reading life</p><h1>{year} in books</h1></div>
        <label className="row small">Year
          <select className="input" style={{ width: 'auto', minHeight: 36 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="life-grid">
        <section className="card goal-card" aria-labelledby="goal-h">
          <h2 id="goal-h" style={{ fontSize: '1.2rem' }}>Reading challenge</h2>
          {g ? (
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center', gap: 18 }}>
              <Ring value={g.finished} max={g.target} label={`${g.finished} of ${g.target} books read, ${g.pct} percent`}>
                <strong style={{ fontSize: '1.9rem', fontFamily: 'var(--serif)' }}>{g.finished}</strong>
                <span className="small muted">of {g.target}</span>
              </Ring>
              <div>
                <p style={{ margin: '0 0 4px' }}><span className={`pill ${g.status === 'behind' ? 'pill-warn' : 'pill-success'}`}>{STATUS_TEXT[g.status]}</span></p>
                <p className="small muted" style={{ margin: '0 0 6px' }}>
                  {g.status === 'done' ? `${g.finished - g.target > 0 ? `${g.finished - g.target} over target. ` : ''}Well done.` : g.status === 'behind' ? `About ${g.behindBy} book${g.behindBy === 1 ? '' : 's'} behind schedule. ` : ''}
                  {g.status !== 'done' && `${g.left} to go in ${g.daysLeft} days, about ${g.perMonth} a month.`}
                </p>
                <button type="button" className="btn btn-sm" onClick={() => setGoalOpen(true)}>Change goal</button>
              </div>
            </div>
          ) : (
            <>
              <p className="muted">Set a goal for {year} and watch your progress ring fill as you finish books.</p>
              <button type="button" className="btn btn-primary" onClick={() => setGoalOpen(true)}>Set a reading goal</button>
            </>
          )}
        </section>

        <section className="card" aria-labelledby="streak-h">
          <h2 id="streak-h" style={{ fontSize: '1.2rem' }}>Reading streak</h2>
          <div className="row" style={{ alignItems: 'baseline', gap: 18 }}>
            <p style={{ margin: 0 }}><span className="streak-num">{s.streak.current}</span> <span className="muted">day{s.streak.current === 1 ? '' : 's'} in a row</span></p>
            <p className="small muted" style={{ margin: 0 }}>Longest: {s.streak.longest} days</p>
          </div>
          <p className="small" style={{ margin: '4px 0 10px' }}>{s.streak.activeToday ? 'You have read today. Nice.' : s.streak.current > 0 ? 'Read for a few minutes today to keep it alive.' : 'Read or log a session to start a streak.'}</p>
          <Heatmap heat={s.heat} />
          <form className="row" onSubmit={log} style={{ marginTop: 10 }}>
            <label className="row small" style={{ gap: 6 }}>Log a session (paper books count too)
              <input className="input" style={{ width: 80, minHeight: 34 }} type="number" min="1" max="240" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Minutes read" />
              min
            </label>
            <button className="btn btn-sm">Log</button>
          </form>
        </section>
      </div>

      <div className="kpis" style={{ marginTop: 20 }}>
        {[
          ['Books finished', s.finishedCount],
          ['Pages read', s.pages.toLocaleString('en-US')],
          ['Average length', s.avgPages ? `${s.avgPages} pages` : '-'],
          ['Time reading', s.minutes ? hoursMin(Math.round(s.minutes)) : '-'],
          ['Favourite genre', s.favouriteGenre || '-'],
        ].map(([l, v]) => <div className="card kpi" key={l}><div className="v" style={{ fontSize: typeof v === 'string' && v.length > 12 ? '1.2rem' : undefined }}>{v}</div><div className="l">{l}</div></div>)}
      </div>

      <div className="admin-two">
        <section className="card" aria-labelledby="month-h">
          <h2 id="month-h" style={{ fontSize: '1.2rem' }}>Books per month</h2>
          <svg className="chart" viewBox="0 0 360 150" role="img" aria-label={`Books finished per month in ${year}: ${s.byMonth.map((n, i) => `${MONTHS[i]} ${n}`).join(', ')}`}>
            {s.byMonth.map((n, i) => (
              <g key={i}>
                <rect className="bar-rect" x={8 + i * 29} width="20" y={120 - (n / maxMonth) * 100} height={(n / maxMonth) * 100} rx="3"><title>{`${MONTHS[i]}: ${n}`}</title></rect>
                <text x={18 + i * 29} y="140" textAnchor="middle">{MONTHS[i][0]}</text>
                {n > 0 && <text x={18 + i * 29} y={114 - (n / maxMonth) * 100} textAnchor="middle">{n}</text>}
              </g>
            ))}
          </svg>
        </section>
        <section className="card" aria-labelledby="genre-h">
          <h2 id="genre-h" style={{ fontSize: '1.2rem' }}>What you read</h2>
          {s.genres.length === 0 ? <p className="muted">Finish a book to see your genres.</p> : <BarList rows={s.genres} valueKey="count" max={s.genres[0].count} />}
        </section>
      </div>

      {s.reading.length > 0 && year === thisYear && (
        <section style={{ marginTop: 24 }} aria-labelledby="now-h">
          <h2 id="now-h">Reading now</h2>
          <ul className="reading-now">
            {s.reading.map((e) => (
              <li key={e.book._id} className="card">
                <div style={{ width: 60 }}><Cover book={e.book} /></div>
                <div className="grow">
                  <Link to={`/books/${e.book._id}`} className="book-title">{e.book.title}</Link>
                  <div className="small muted">{e.book.author}{e.startedAt ? ` · started ${fmtDate(e.startedAt)}` : ''}</div>
                  <div className="row" style={{ marginTop: 6 }}>
                    {e.book.formats.some((f) => f.type === 'ebook') && <Link className="btn btn-sm" to={`/read/${e.book._id}`}>Open reader</Link>}
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => finish(e.book)}>Mark as finished</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: 24 }} aria-labelledby="fin-h">
        <h2 id="fin-h">Finished in {year}</h2>
        {s.finished.length === 0 ? (
          <EmptyState title="No finished books yet" text="Mark a book as finished from its page or your reading list and it will appear here." to="/reading-list" action="Open reading list" />
        ) : (
          <ol className="finished-list">
            {s.finished.map((f) => <li key={f.book._id}><span className="small muted">{fmtDate(f.finishedAt)}</span> <Link to={`/books/${f.book._id}`}>{f.book.title}</Link> <span className="muted small">{f.book.author}{f.book.pages ? `, ${f.book.pages} pages` : ''}</span></li>)}
          </ol>
        )}
      </section>

      {rec.data?.sections.length > 0 && (
        <section style={{ marginTop: 28 }} aria-labelledby="next-h">
          <h2 id="next-h">What to read next</h2>
          {rec.data.sections.slice(0, 2).map((sec, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <h3>{sec.kind === 'follow' ? 'New from authors you follow' : `Because you ${sec.kind === 'purchased' ? 'bought' : sec.kind === 'reading' ? 'are reading' : 'read'} ${sec.because.title}`}</h3>
              <ul className="strip" style={{ margin: 0, listStyle: 'none' }}>{sec.books.map((b) => <BookCard key={b._id} book={b} />)}</ul>
            </div>
          ))}
        </section>
      )}
      <GoalDialog open={goalOpen} onClose={() => setGoalOpen(false)} goal={s.goalRaw && s.goal} year={year} onSaved={() => (setGoalOpen(false), reload())} />
    </div>
  )
}
