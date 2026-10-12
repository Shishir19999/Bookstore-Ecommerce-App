import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, downloadCsv } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Pager } from '../ui/Parts'
import ManageNav from './ManageNav'
import { FORMAT_LABEL, ORDER_STATUSES, STATUS_LABEL, fmtDateTime, money, shortId } from '../lib/format'

export default function ManageOrders() {
  useTitle('Manage orders')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const kind = params.get('kind') || ''
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1)
  const [q, setQ] = useState(params.get('q') || '')
  const query = new URLSearchParams({ page, limit: 12 })
  for (const k of ['status', 'kind', 'q']) if (params.get(k)) query.set(k, params.get(k))
  const { data, error, reload } = useFetch(`/api/admin/orders?${query}`)
  const toast = useToast()
  const set = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const update = async (o, next) => {
    try {
      await api(`/api/admin/orders/${o._id}/status`, { method: 'PATCH', body: { status: next } })
      toast.success(`Order #${shortId(o._id)} is now ${STATUS_LABEL[next].toLowerCase()}.`)
      reload()
    } catch (err) {
      toast.error(err.message)
      reload()
    }
  }
  return (
    <div className="container page">
      <div className="row between">
        <h1>Manage orders</h1>
        <button type="button" className="btn" onClick={() => downloadCsv('/api/export/orders.csv', 'orders.csv').catch((e) => toast.error(e.message))}>Export CSV</button>
      </div>
      <ManageNav />
      <div className="row" style={{ marginBottom: 14 }}>
        <form className="row" role="search" onSubmit={(e) => (e.preventDefault(), set({ q: q.trim() }))}>
          <label className="sr-only" htmlFor="ord-q">Search by order number, name or email</label>
          <input id="ord-q" className="input" style={{ maxWidth: 260 }} placeholder="Order no., name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-sm">Search</button>
        </form>
        <label className="row small" style={{ gap: 6 }}>Status
          <select className="input" style={{ width: 'auto', minHeight: 36 }} value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="row small" style={{ gap: 6 }}>Contains
          <select className="input" style={{ width: 'auto', minHeight: 36 }} value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">Anything</option><option value="physical">Printed books</option><option value="digital">Digital items</option>
          </select>
        </label>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.orders.length === 0 ? <EmptyState title="No orders" text="No orders match these filters." /> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Orders</caption>
            <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Items</th><th scope="col" className="num">Total</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col">Print</th></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o._id}>
                  <td>#{shortId(o._id)}<div className="small muted">{o.paymentStatus}{o.couponCode ? ` · ${o.couponCode}` : ''}{o.gift ? ' · gift' : ''}</div></td>
                  <td>{o.user ? <>{o.user.name}<div className="small muted">{o.user.email}</div></> : <span className="muted">Deleted user</span>}</td>
                  <td>{o.items.map((i) => (i.kind === 'giftcard' ? 'Gift card' : `${i.title} (${FORMAT_LABEL[i.format || 'paperback']}) x ${i.qty}`)).join(', ')}</td>
                  <td className="num">{money(o.total)}{o.refundedTotal > 0 && <div className="small muted">-{money(o.refundedTotal)} refunded</div>}</td>
                  <td>{fmtDateTime(o.createdAt)}</td>
                  <td>
                    <label className="sr-only" htmlFor={`st-${o._id}`}>Status of order {shortId(o._id)}</label>
                    <select id={`st-${o._id}`} className="input" style={{ minHeight: 34, width: 'auto' }} value={o.status} onChange={(e) => update(o, e.target.value)}>
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><Link className="btn btn-sm" to={`/orders/${o._id}/invoice`}>Invoice</Link><Link className="btn btn-sm" to={`/orders/${o._id}/packing-slip`}>Slip</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: String(p) })} />}
    </div>
  )
}
