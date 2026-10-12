import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, saveFile } from '../api'
import { useAuth, useConfirm, useFetch, useTitle, useToast } from '../hooks'
import BookCard from '../components/ProductItem'
import Cover from '../ui/Cover'
import { EmptyState, ErrorState, GridSkeleton, PageSkeleton } from '../ui/States'
import { Stars } from '../ui/Stars'
import { Field, Modal, Tabs, Panel } from '../ui/Parts'
import { authorPath, fmtDateTime, fmtDay, fmtTime, genrePath, plural, seriesPath, timeAgo } from '../lib/format'
import { subscribe } from '../lib/realtime'

function FollowButton({ slug, name, following, onChange }) {
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    if (!user) return toast.info('Log in to follow authors.')
    setBusy(true)
    try {
      const r = await api(`/api/authors/${slug}/follow`, { method: following ? 'DELETE' : 'POST' })
      toast.success(r.following ? `You now follow ${name}.` : `Unfollowed ${name}.`)
      onChange(r)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return <button type="button" className={`btn ${following ? '' : 'btn-primary'}`} aria-pressed={following} disabled={busy} onClick={toggle}>{following ? 'Following' : 'Follow'}</button>
}

const EVENT_LABEL = { signing: 'Signing', reading: 'Reading', qna: 'Q&A', launch: 'Book launch', workshop: 'Workshop' }

// Builds an .ics calendar file for an event.
function downloadIcs(e) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = new Date(e.startsAt)
  const end = new Date(start.getTime() + 90 * 60000)
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Folio Books//Events//EN', 'BEGIN:VEVENT', `UID:${e._id}@folio-books`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(e.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  saveFile(ics, `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`, 'text/calendar')
}

function EventCard({ e, onChange }) {
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const past = new Date(e.startsAt) < new Date()
  const rsvp = async () => {
    if (!user) return toast.info('Log in to RSVP.')
    setBusy(true)
    try {
      const r = await api(`/api/events/${e._id}/rsvp`, { method: 'POST', body: { going: !e.joined } })
      toast.success(r.joined ? 'You are on the list.' : 'RSVP cancelled.')
      onChange()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  const d = new Date(e.startsAt)
  return (
    <li className="card event-card">
      <span className="date-chip" aria-hidden="true"><b>{d.getDate()}</b>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
      <div className="grow">
        <div className="row" style={{ gap: 6 }}><span className="pill pill-accent">{EVENT_LABEL[e.type] || e.type}</span><span className="pill">{e.online ? 'Online' : 'In store'}</span></div>
        <h2 style={{ fontSize: '1.25rem', margin: '6px 0 2px' }}>{e.title}</h2>
        <p className="small muted" style={{ margin: 0 }}>{e.author ? <><Link to={authorPath(e.author)}>{e.author}</Link> &middot; </> : ''}{fmtDay(e.startsAt)}, {fmtTime(e.startsAt)} &middot; {e.location}</p>
        {e.description && <p style={{ margin: '6px 0' }}>{e.description}</p>}
        <p className="small muted" style={{ margin: 0 }}>{e.going} going{e.capacity > 0 ? ` of ${e.capacity} places` : ''}</p>
      </div>
      {!past && (
        <div className="stack" style={{ minWidth: 140 }}>
          <button type="button" className={`btn ${e.joined ? '' : 'btn-primary'}`} aria-pressed={e.joined} disabled={busy || (e.full && !e.joined)} onClick={rsvp}>{e.joined ? 'Going: cancel' : e.full ? 'Full' : 'RSVP'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadIcs(e)}>Add to calendar</button>
        </div>
      )}
    </li>
  )
}

export function Events() {
  useTitle('Events')
  const [tab, setTab] = useState('upcoming')
  const { data, error, reload } = useFetch(`/api/events?when=${tab}`)
  return (
    <div className="container page">
      <p className="eyebrow">Meet the authors</p>
      <h1>Events</h1>
      <Tabs tabs={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }]} value={tab} onChange={setTab} label="Events" />
      <Panel id={tab}>
        {error && <ErrorState message={error} onRetry={reload} />}
        {!data && !error && <PageSkeleton />}
        {data && data.events.length === 0 && <EmptyState title={tab === 'upcoming' ? 'No upcoming events' : 'No past events'} text="Follow your favourite authors to hear about new events." to="/authors" action="Find authors" />}
        {data && data.events.length > 0 && <ul className="event-list">{data.events.map((e) => <EventCard key={e._id} e={e} onChange={reload} />)}</ul>}
      </Panel>
    </div>
  )
}

export function Authors() {
  useTitle('Authors')
  const [q, setQ] = useState('')
  const { data, error, reload } = useFetch(`/api/authors?search=${encodeURIComponent(q)}`)
  return (
    <div className="container page">
      <p className="eyebrow">Browse</p>
      <h1>Authors</h1>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="author-q">Find an author</label>
        <input id="author-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" />
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <GridSkeleton count={4} />}
      {data && (data.authors.length === 0 ? <EmptyState title="No authors match" /> : (
        <ul className="author-grid" aria-label="Authors">
          {data.authors.map((a) => (
            <li key={a.slug} className="card">
              <Link to={authorPath(a.name)} className="book-title">{a.name}</Link>
              <span className="small muted">{plural(a.bookCount, 'book')} &middot; {a.genres.join(', ')}</span>
              {a.bio && <span className="small">{a.bio.slice(0, 110)}{a.bio.length > 110 ? '...' : ''}</span>}
              <span className="small muted">{plural(a.followers, 'follower')}{a.following ? ' · you follow' : ''}</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

export function Author() {
  const { name } = useParams()
  const { data, error, loading, reload } = useFetch(`/api/authors/${encodeURIComponent(name)}`)
  const [follow, setFollow] = useState(null)
  useTitle(data?.author || name)
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Author not found' : undefined} message={error} onRetry={/not found/i.test(error) ? undefined : reload} /></div>
  if (loading || !data) return <div className="container page"><GridSkeleton count={4} /></div>
  const { author, books, stats, profile } = data
  const following = follow?.slug === data.slug ? follow.following : data.following
  const followers = follow?.slug === data.slug ? follow.followers : data.followers
  return (
    <div className="container page">
      <header className="card" style={{ marginBottom: 28 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow">Author</p>
            <h1 style={{ marginBottom: 8 }}>{author}</h1>
          </div>
          <FollowButton slug={data.slug} name={author} following={following} onChange={(r) => setFollow({ slug: data.slug, ...r })} />
        </div>
        {profile?.bio && <p style={{ maxWidth: '70ch' }}>{profile.bio}</p>}
        <div className="meta">
          {profile?.location && <span>{profile.location}</span>}
          <span>{plural(stats.count, 'book')}</span>
          {stats.avgRating > 0 && <Stars value={stats.avgRating} />}
          {stats.avgRating > 0 && <span>{stats.avgRating.toFixed(1)} average rating</span>}
          <span>{stats.sold} copies sold</span>
          <span>{plural(followers, 'follower')}</span>
          {profile?.website && <a href={profile.website} rel="noopener noreferrer" target="_blank">Website</a>}
        </div>
        <div className="row">
          {stats.genres.map((g) => <Link key={g} className="chip" to={genrePath(g)}>{g}</Link>)}
          {data.series.map((s) => <Link key={s.slug} className="chip" to={seriesPath(s)}>Series: {s.name}</Link>)}
        </div>
      </header>
      {data.events.length > 0 && (
        <section aria-labelledby="ev-h" style={{ marginBottom: 28 }}>
          <h2 id="ev-h">Upcoming events with {author}</h2>
          <ul className="event-list">{data.events.map((e) => <EventCard key={e._id} e={e} onChange={reload} />)}</ul>
        </section>
      )}
      <h2>Books by {author}</h2>
      <ul className="book-grid">{books.map((b) => <BookCard key={b._id} book={b} />)}</ul>
    </div>
  )
}

// ---------- book clubs ----------
function NewClub({ open, onClose, onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    try {
      const c = await api('/api/clubs', { method: 'POST', body: { name, description } })
      toast.success('Club created. Choose your first monthly pick!')
      onCreated(c)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Start a book club">
      <form onSubmit={submit} noValidate>
        <Field label="Club name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} error={error} />
        <Field label="What is it about? (optional)" as="textarea" rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Create club</button></div>
      </form>
    </Modal>
  )
}

export function Clubs() {
  useTitle('Book clubs')
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, reload } = useFetch('/api/clubs')
  const [creating, setCreating] = useState(false)
  const toggle = async (c) => {
    if (!user) return toast.info('Log in to join a club.')
    try {
      await api(`/api/clubs/${c._id}/${c.joined ? 'leave' : 'join'}`, { method: 'POST' })
      toast.success(c.joined ? `You left ${c.name}.` : `Welcome to ${c.name}!`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <div className="container page">
      <div className="row between">
        <div><p className="eyebrow">Read together</p><h1>Book clubs</h1></div>
        <button type="button" className="btn btn-primary" onClick={() => (user ? setCreating(true) : navigate('/login', { state: { from: '/clubs' } }))}>Start a club</button>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (data.clubs.length === 0 ? <EmptyState title="No clubs yet" text="Be the first to start one." /> : (
        <ul className="club-grid">
          {data.clubs.map((c) => (
            <li key={c._id} className="card club-card">
              <div style={{ width: 70 }}>{c.pick?.book ? <Cover book={c.pick.book} /> : <div className="gc-thumb" aria-hidden="true">?</div>}</div>
              <div className="grow">
                <Link to={`/clubs/${c._id}`} className="book-title">{c.name}</Link>
                <p className="small muted" style={{ margin: '2px 0' }}>{plural(c.members, 'member')} &middot; run by {c.ownerName}</p>
                <p className="small" style={{ margin: '2px 0' }}>{c.pick?.book ? <>Reading: <strong>{c.pick.book.title}</strong></> : c.description}</p>
                <button type="button" className={`btn btn-sm ${c.joined ? '' : 'btn-primary'}`} disabled={c.isOwner} onClick={() => toggle(c)}>{c.isOwner ? 'You run this club' : c.joined ? 'Leave' : 'Join'}</button>
              </div>
            </li>
          ))}
        </ul>
      ))}
      <NewClub open={creating} onClose={() => setCreating(false)} onCreated={(c) => navigate(`/clubs/${c._id}`)} />
    </div>
  )
}

function PickDialog({ club, open, onClose, onSaved }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [bookId, setBookId] = useState('')
  const [note, setNote] = useState('')
  const [discussAt, setDiscussAt] = useState('')
  const { data } = useFetch(`/api/books?search=${encodeURIComponent(q)}&limit=8&sort=title`, { enabled: open })
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!bookId) return setError('Choose a book.')
    try {
      await api(`/api/clubs/${club._id}/pick`, { method: 'PUT', body: { bookId, note, discussAt: discussAt || undefined } })
      toast.success('Monthly pick updated. Members have been notified.')
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Choose the monthly pick" wide>
      <form onSubmit={submit} noValidate>
        <Field label="Search the catalogue" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <fieldset className="choice-group">
          <legend>Pick a book</legend>
          <div className="pick-list">
            {(data?.books || []).map((b) => (
              <label key={b._id} className={`choice ${bookId === b._id ? 'on' : ''}`}>
                <input type="radio" name="pick" value={b._id} checked={bookId === b._id} onChange={() => setBookId(b._id)} />
                <span>{b.title} <span className="muted small">by {b.author}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Note for members (optional)" as="textarea" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <Field label="Discussion date (optional)" type="date" value={discussAt} onChange={(e) => setDiscussAt(e.target.value)} />
        {error && <p className="err" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save pick</button></div>
      </form>
    </Modal>
  )
}

export function ClubDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { data, error, reload } = useFetch(`/api/clubs/${id}`)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [formErr, setFormErr] = useState('')
  const [picking, setPicking] = useState(false)
  useTitle(data?.club.name)
  useEffect(() => {
    return subscribe(`club:${id}`, () => reload())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Club not found' : undefined} message={error} onRetry={reload} /></div>
  if (!data) return <PageSkeleton />
  const { club, members, threads, history } = data
  const canPick = club.isOwner || user?.role !== 'user'
  const membership = async () => {
    if (!user) return toast.info('Log in to join a club.')
    try {
      await api(`/api/clubs/${id}/${club.joined ? 'leave' : 'join'}`, { method: 'POST' })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const start = async (e) => {
    e.preventDefault()
    setFormErr('')
    try {
      const r = await api(`/api/clubs/${id}/threads`, { method: 'POST', body: { title, body } })
      navigate(`/clubs/${id}/threads/${r.thread._id}`)
    } catch (err) {
      setFormErr(err.message)
    }
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this club?', message: 'All discussions are removed. This cannot be undone.', confirmLabel: 'Delete club', danger: true }))) return
    try {
      await api(`/api/clubs/${id}`, { method: 'DELETE' })
      navigate('/clubs')
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <div className="container page">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 12 }}><Link to="/clubs">Book clubs</Link> / {club.name}</nav>
      <header className="card" style={{ marginBottom: 24 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{club.name}</h1>
            <p className="muted" style={{ margin: 0 }}>{club.description} &middot; {plural(club.members, 'member')} &middot; run by {club.ownerName}</p>
          </div>
          <div className="row">
            <span className="pill pill-success" title="New posts appear without reloading">Live</span>
            {!club.isOwner && <button type="button" className={`btn ${club.joined ? '' : 'btn-primary'}`} onClick={membership}>{club.joined ? 'Leave club' : 'Join club'}</button>}
            {club.isOwner && <button type="button" className="btn btn-outline-danger btn-sm" onClick={remove}>Delete club</button>}
          </div>
        </div>
      </header>
      <div className="two-col">
        <section aria-labelledby="pick-h">
          <h2 id="pick-h">This month&apos;s pick</h2>
          {club.pick?.book ? (
            <div className="card pick-card">
              <div style={{ width: 110 }}><Cover book={club.pick.book} eager /></div>
              <div>
                <Link to={`/books/${club.pick.book._id}`} className="book-title" style={{ fontSize: '1.25rem' }}>{club.pick.book.title}</Link>
                <p className="small muted" style={{ margin: '2px 0' }}>{club.pick.book.author} &middot; {club.pick.month}</p>
                {club.pick.note && <p>{club.pick.note}</p>}
                {club.pick.discussAt && <p className="small"><strong>Discussion:</strong> {fmtDateTime(club.pick.discussAt)}</p>}
                <div className="row"><Link to={`/books/${club.pick.book._id}`} className="btn btn-sm btn-primary">Get the book</Link><Link to={`/read/${club.pick.book._id}`} className="btn btn-sm">Free sample</Link></div>
              </div>
            </div>
          ) : (
            <p className="muted">No pick yet.</p>
          )}
          {canPick && <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setPicking(true)}>{club.pick ? 'Change the pick' : 'Choose the first pick'}</button>}
          {history.length > 0 && <p className="small muted" style={{ marginTop: 14 }}>Previously: {history.filter((h) => h.book).map((h) => h.book.title).join(', ')}</p>}
          <h2 style={{ marginTop: 28 }}>Members</h2>
          <ul className="member-list">{members.map((m) => <li key={m.id} className="pill">{m.name}</li>)}</ul>
        </section>
        <section aria-labelledby="disc-h">
          <h2 id="disc-h">Discussions</h2>
          {club.joined ? (
            <form className="card" onSubmit={start} noValidate style={{ marginBottom: 16 }}>
              <Field label="Start a discussion" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title" />
              <Field label="First message" as="textarea" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} error={formErr} />
              <button className="btn btn-primary">Post</button>
            </form>
          ) : (
            <p className="alert alert-info">{user ? 'Join the club to start or join a discussion.' : <><Link to="/login" state={{ from: `/clubs/${id}` }}>Log in</Link> and join the club to take part.</>}</p>
          )}
          {threads.length === 0 ? <p className="muted">No discussions yet.</p> : (
            <ul className="thread-list">
              {threads.map((t) => (
                <li key={t._id} className="card">
                  <Link to={`/clubs/${id}/threads/${t._id}`} className="book-title">{t.title}</Link>
                  <span className="small muted">{t.authorName} &middot; {plural(t.posts, 'post')} &middot; last activity {timeAgo(t.lastPostAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <PickDialog club={club} open={picking} onClose={() => setPicking(false)} onSaved={() => (setPicking(false), reload())} />
    </div>
  )
}

export function ThreadView() {
  const { id, tid } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const { data, error, reload } = useFetch(`/api/clubs/${id}/threads/${tid}`)
  const club = useFetch(`/api/clubs/${id}`)
  const [live, setLive] = useState([])
  const [reply, setReply] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef(null)
  useTitle(data?.thread.title)
  useEffect(() => {
    const off = subscribe(`club:${id}`, (event, payload) => {
      if (payload?.threadId !== tid) return
      if (event === 'post') setLive((l) => (l.some((p) => p._id === payload.post._id) ? l : [...l, payload.post]))
      if (event === 'post-removed') reload()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tid])
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [live.length])
  if (error) return <div className="container page"><ErrorState title={/not found/i.test(error) ? 'Discussion not found' : undefined} message={error} onRetry={reload} /></div>
  if (!data) return <PageSkeleton />
  const posts = [...data.posts, ...live.filter((p) => !data.posts.some((x) => x._id === p._id))]
  const joined = club.data?.club.joined
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const p = await api(`/api/clubs/${id}/threads/${tid}/posts`, { method: 'POST', body: { body: reply, spoiler } })
      setLive((l) => [...l, p])
      setReply('')
      setSpoiler(false)
    } catch (x) {
      setErr(x.message)
    }
  }
  const remove = async (p) => {
    try {
      await api(`/api/clubs/${id}/threads/${tid}/posts/${p._id}`, { method: 'DELETE' })
      setLive((l) => l.filter((x) => x._id !== p._id))
      reload()
    } catch (x) {
      toast.error(x.message)
    }
  }
  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 12 }}><Link to="/clubs">Book clubs</Link> / <Link to={`/clubs/${id}`}>{club.data?.club.name || 'Club'}</Link> / Discussion</nav>
      <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2.2rem)' }}>{data.thread.title}</h1>
      <p className="small muted" role="status" aria-live="polite">New replies appear here instantly. {posts.length} {posts.length === 1 ? 'post' : 'posts'}.</p>
      <ol className="posts">
        {posts.map((p) => (
          <li key={p._id} className="card post">
            <div className="row between"><strong>{p.name}</strong><span className="small muted">{timeAgo(p.createdAt)}</span></div>
            {p.spoiler ? <details><summary>Spoiler: click to read</summary><p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{p.body}</p></details> : <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{p.body}</p>}
            {(p.mine || user?.role === 'staff' || user?.role === 'admin') && <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => remove(p)}>Delete</button>}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      {joined ? (
        <form className="card" onSubmit={submit} noValidate>
          <Field label="Reply" as="textarea" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} error={err} />
          <label className="row small"><input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Hide behind a spoiler tag</label>
          <button className="btn btn-primary" style={{ marginTop: 10 }}>Post reply</button>
        </form>
      ) : (
        <p className="alert alert-info">{user ? <>Join <Link to={`/clubs/${id}`}>the club</Link> to reply.</> : <><Link to="/login" state={{ from: `/clubs/${id}/threads/${tid}` }}>Log in</Link> and join the club to reply.</>}</p>
      )}
    </div>
  )
}

