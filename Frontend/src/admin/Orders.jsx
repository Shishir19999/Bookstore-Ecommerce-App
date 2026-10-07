import { useState } from 'react'
import { api } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import AdminNav from './AdminNav'
import { ORDER_STATUSES, fmtDateTime, money } from '../lib/format'

export default function Orders() {
  useTitle('Manage orders')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const params = new URLSearchParams({ page, limit: 10 })
  if (status) params.set('status', status)
  const { data, error, reload } = useFetch(`/api/admin/orders?${params}`)
  const toast = useToast()

  const update = async (o, next) => {
    try {
      await api(`/api/admin/orders/${o._id}/status`, { method: 'PATCH', body: { status: next } })
      toast.success(`Order #${o._id.slice(-6).toUpperCase()} is now ${next}.`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="container page">
      <h1>Manage orders</h1>
      <AdminNav />
      <label className="row small" style={{ marginBottom: 14, gap: 8 }}>
        Filter by status
        <select className="input" style={{ width: 'auto', minHeight: 36 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton />
      ) : data.orders.length === 0 ? (
        <EmptyState title="No orders" text="No orders match this filter." />
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Orders</caption>
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Placed</th><th>Status</th></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o._id}>
                  <td>#{o._id.slice(-6).toUpperCase()}{o.couponCode && <div className="small muted">{o.couponCode}</div>}</td>
                  <td>{o.user ? <>{o.user.name}<div className="small muted">{o.user.email}</div></> : <span className="muted">Deleted user</span>}</td>
                  <td>{o.items.map((i) => `${i.title} x ${i.qty}`).join(', ')}</td>
                  <td className="num">{money(o.total)}</td>
                  <td>{fmtDateTime(o.createdAt)}</td>
                  <td>
                    <label className="sr-only" htmlFor={`st-${o._id}`}>Status of order {o._id.slice(-6)}</label>
                    <select id={`st-${o._id}`} className="input" style={{ minHeight: 34, width: 'auto' }} value={o.status} onChange={(e) => update(o, e.target.value)}>
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="small">Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  )
}
