import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useConfirm, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Pager, Panel, Tabs } from '../ui/Parts'
import { Stars } from '../ui/Stars'
import ManageNav from './ManageNav'
import { fmtDate, timeAgo } from '../lib/format'

function Reviews() {
  const [filter, setFilter] = useState('reported')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useFetch(`/api/staff/reviews?filter=${filter}&page=${page}&limit=10`)
  const toast = useToast()
  const confirm = useConfirm()
  const act = async (path, method, body, msg) => {
    try {
      await api(path, { method, body })
      toast.success(msg)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const del = async (r) => {
    if (await confirm({ title: 'Delete this review?', message: 'It is removed for good. Hiding it is reversible.', confirmLabel: 'Delete', danger: true })) act(`/api/staff/reviews/${r._id}`, 'DELETE', undefined, 'Review deleted.')
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" role="group" aria-label="Filter reviews" style={{ marginBottom: 12 }}>
        {[['reported', 'Reported'], ['hidden', 'Hidden'], ['all', 'All']].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => (setFilter(v), setPage(1))}>{l}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.reviews.length === 0 ? <EmptyState title="Nothing to moderate" text={filter === 'reported' ? 'No reviews have been reported.' : 'No reviews in this list.'} /> : (
        <ul className="plain">
          {data.reviews.map((r) => (
            <li key={r._id} className="card" style={{ marginBottom: 10 }}>
              <div className="row between">
                <span><strong>{r.name}</strong> on <Link to={`/books/${r.book}`}>{r.bookTitle}</Link> <span className="small muted">{fmtDate(r.createdAt)}</span></span>
                <span className="row" style={{ gap: 6 }}>{r.reports > 0 && <span className="pill pill-danger">{r.reports} report{r.reports === 1 ? '' : 's'}</span>}{r.hidden && <span className="pill">Hidden</span>}{r.spoiler && <span className="pill pill-warn">Spoiler</span>}</span>
              </div>
              <Stars value={r.rating} />
              <p style={{ margin: '6px 0' }}>{r.text || <span className="muted">(no text)</span>}</p>
              {r.lastReport && <p className="small muted">Last report: {r.lastReport}</p>}
              <div className="row">
                {r.hidden ? <button type="button" className="btn btn-sm" onClick={() => act(`/api/staff/reviews/${r._id}/hide`, 'POST', { hidden: false }, 'Review restored.')}>Restore</button> : <button type="button" className="btn btn-sm" onClick={() => act(`/api/staff/reviews/${r._id}/hide`, 'POST', { hidden: true, reason: 'Hidden after a report' }, 'Review hidden; the reviewer was told.')}>Hide</button>}
                {r.reports > 0 && <button type="button" className="btn btn-sm" onClick={() => act(`/api/staff/reviews/${r._id}/dismiss`, 'POST', {}, 'Reports dismissed.')}>Dismiss reports</button>}
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => del(r)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </div>
  )
}

function Questions() {
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useFetch(`/api/staff/questions?status=${status}`)
  const toast = useToast()
  const [answer, setAnswer] = useState({})
  const reply = async (e, q) => {
    e.preventDefault()
    try {
      await api(`/api/questions/${q._id}/answers`, { method: 'POST', body: { text: answer[q._id] || '' } })
      toast.success('Answer posted.')
      setAnswer({ ...answer, [q._id]: '' })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const remove = async (q) => {
    try {
      await api(`/api/questions/${q._id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" role="group" aria-label="Filter questions" style={{ marginBottom: 12 }}>
        {[['open', 'Unanswered'], ['all', 'All']].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.length === 0 ? <EmptyState title="All caught up" text="No unanswered questions." /> : (
        <ul className="plain">
          {data.map((q) => (
            <li key={q._id} className="card" style={{ marginBottom: 10 }}>
              <p style={{ margin: 0 }}><strong>Q:</strong> {q.text}</p>
              <p className="small muted" style={{ margin: '2px 0 6px' }}>{q.name} on <Link to={`/books/${q.book}`}>{q.bookTitle}</Link>, {timeAgo(q.createdAt)}</p>
              {q.answers.map((a) => <p key={a._id} className="qa-answer"><strong>A:</strong> {a.text} <span className="small muted">{a.name}</span></p>)}
              <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => reply(e, q)}>
                <label className="sr-only" htmlFor={`a-${q._id}`}>Answer</label>
                <input id={`a-${q._id}`} className="input" placeholder="Write an answer" maxLength={800} value={answer[q._id] || ''} onChange={(e) => setAnswer({ ...answer, [q._id]: e.target.value })} />
                <button className="btn btn-sm btn-primary" disabled={!(answer[q._id] || '').trim()}>Answer</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(q)}>Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Moderation() {
  useTitle('Moderation')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'reviews'
  return (
    <div className="container page">
      <h1>Moderation</h1>
      <ManageNav />
      <Tabs tabs={[{ id: 'reviews', label: 'Reviews' }, { id: 'questions', label: 'Questions and answers' }]} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} label="Moderation queues" />
      <Panel id={tab}>{tab === 'reviews' ? <Reviews /> : <Questions />}</Panel>
    </div>
  )
}
