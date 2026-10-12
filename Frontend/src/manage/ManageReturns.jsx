import { useState } from 'react'
import { api, downloadCsv } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Field, Modal, StatusPill } from '../ui/Parts'
import ManageNav from './ManageNav'
import { RETURN_REASONS, fmtDate, money, shortId } from '../lib/format'

const NEXT = { requested: [['approved', 'Approve'], ['rejected', 'Reject']], approved: [['received', 'Mark received'], ['refunded', 'Refund now'], ['rejected', 'Reject']], received: [['refunded', 'Refund']] }

export default function ManageReturns() {
  useTitle('Manage returns')
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useFetch(`/api/staff/returns?status=${status === 'open' ? 'all' : status}`)
  const toast = useToast()
  const [acting, setActing] = useState(null) // { r, to, label }
  const [note, setNote] = useState('')
  const [restock, setRestock] = useState(true)
  const rows = (data || []).filter((r) => status !== 'open' || ['requested', 'approved', 'received'].includes(r.status))
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api(`/api/staff/returns/${acting.r._id}/decision`, { method: 'POST', body: { status: acting.to, note, restock } })
      toast.success(`Return #${shortId(acting.r._id)} ${acting.to}.`)
      setActing(null)
      setNote('')
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <div className="container page">
      <div className="row between">
        <h1>Returns</h1>
        <button type="button" className="btn" onClick={() => downloadCsv('/api/export/returns.csv', 'returns.csv').catch((e) => toast.error(e.message))}>Export CSV</button>
      </div>
      <ManageNav />
      <div className="row" role="group" aria-label="Filter" style={{ marginBottom: 14 }}>
        {[['open', 'Open'], ['all', 'All'], ['refunded', 'Refunded'], ['rejected', 'Rejected']].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : rows.length === 0 ? <EmptyState title="No returns here" text="Return requests from customers show up in this list." /> : (
        <ul className="plain">
          {rows.map((r) => (
            <li key={r._id} className="card order">
              <div className="order-head">
                <div><strong>Return #{shortId(r._id)}</strong><div className="small muted">Order #{shortId(r.order)} &middot; {r.customer?.name} ({r.customer?.email}) &middot; {fmtDate(r.createdAt)}</div></div>
                <StatusPill status={r.status} />
                <strong>{money(r.amount)}</strong>
              </div>
              <ul className="order-items">{r.items.map((i) => <li key={`${i.book}-${i.format}`}>{i.title} x {i.qty} <span className="muted">({money(i.price)})</span></li>)}</ul>
              <p className="small muted">Reason: {RETURN_REASONS.find(([v]) => v === r.reason)?.[1] || r.reason}{r.note ? ` - "${r.note}"` : ''}</p>
              <ul className="small timeline">{r.history.map((h, k) => <li key={k}><strong>{h.status}</strong> by {h.by}, {fmtDate(h.at)}{h.note ? `: ${h.note}` : ''}</li>)}</ul>
              <div className="row">
                {(NEXT[r.status] || []).map(([to, label]) => <button key={to} type="button" className={`btn btn-sm ${to === 'rejected' ? 'btn-outline-danger' : to === 'refunded' ? 'btn-primary' : ''}`} onClick={() => (setActing({ r, to, label }), setNote(''))}>{label}</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting ? `${acting.label}: return #${shortId(acting.r._id)}` : ''}>
        {acting && (
          <form onSubmit={submit}>
            {acting.to === 'refunded' && <p>Refund <strong>{money(acting.r.amount)}</strong> to the customer (item price plus its share of tax; shipping is not refunded). Reward points for the refunded amount are reversed.</p>}
            <Field label="Note to the customer (optional)" as="textarea" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            {acting.to === 'refunded' && <label className="row small"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Return the copies to stock</label>}
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setActing(null)}>Cancel</button><button className="btn btn-primary">{acting.label}</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}
