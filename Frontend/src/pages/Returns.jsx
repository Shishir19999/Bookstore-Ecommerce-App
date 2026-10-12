import { Link } from 'react-router-dom'
import { api } from '../api'
import { useConfirm, useFetch, useSettings, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { StatusPill } from '../ui/Parts'
import { RETURN_REASONS, fmtDate, money, shortId } from '../lib/format'

const STEPS = ['requested', 'approved', 'received', 'refunded']

export default function Returns() {
  useTitle('My returns')
  const settings = useSettings()
  const { data, error, loading, reload } = useFetch('/api/me/returns')
  const toast = useToast()
  const confirm = useConfirm()
  const withdraw = async (r) => {
    if (!(await confirm({ title: 'Withdraw this return request?', message: 'You can send a new one later while the return window is open.', confirmLabel: 'Withdraw' }))) return
    try {
      await api(`/api/me/returns/${r._id}/cancel`, { method: 'POST' })
      toast.success('Return request withdrawn.')
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />
  return (
    <div className="container page">
      <h1>My returns</h1>
      <p className="muted">Printed books can be returned within {settings.returns.windowDays} days of delivery. Start a return from <Link to="/orders">your orders</Link>.</p>
      {data.length === 0 ? (
        <EmptyState title="No returns" text="Return requests you send appear here with their status." to="/orders" action="Go to orders" />
      ) : (
        data.map((r) => {
          const at = STEPS.indexOf(r.status)
          return (
            <article className="card order" key={r._id} aria-label={`Return ${shortId(r._id)}`}>
              <div className="order-head">
                <div>
                  <strong>Return #{shortId(r._id)}</strong>
                  <div className="small muted">For order #{shortId(r.order)} &middot; requested {fmtDate(r.createdAt)}</div>
                </div>
                <StatusPill status={r.status} />
                <strong>{money(r.amount)}</strong>
              </div>
              {at >= 0 && (
                <ol className="track" aria-label={`Return status: ${r.status}`}>
                  {STEPS.map((s, i) => <li key={s} className={i <= at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>{s}</li>)}
                </ol>
              )}
              <ul className="order-items">
                {r.items.map((i) => <li key={`${i.book}-${i.format}`}>{i.title} x {i.qty}</li>)}
              </ul>
              <p className="small muted">Reason: {RETURN_REASONS.find(([v]) => v === r.reason)?.[1] || r.reason}{r.note ? ` - "${r.note}"` : ''}</p>
              {r.history.length > 1 && (
                <ul className="small timeline">
                  {r.history.map((h, k) => <li key={k}><strong>{h.status}</strong> {fmtDate(h.at)}{h.note ? `: ${h.note}` : ''}</li>)}
                </ul>
              )}
              {r.status === 'requested' && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => withdraw(r)}>Withdraw request</button>}
            </article>
          )
        })
      )}
    </div>
  )
}
