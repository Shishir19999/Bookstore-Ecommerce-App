import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useCart, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import Tracking from '../ui/Tracking'
import { fmtDate, money, shortId } from '../lib/format'

export default function MyOrders() {
  useTitle('My orders')
  const { data, error, loading, reload } = useFetch('/api/orders/mine')
  const { addLines } = useCart()
  const toast = useToast()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState('')

  const reorder = async (order) => {
    setBusyId(order._id)
    try {
      const { items, unavailable } = await api(`/api/orders/${order._id}/reorder`, { method: 'POST' })
      if (items.length) addLines(items)
      if (unavailable.length) toast.info(`Not available right now: ${unavailable.join(', ')}.`)
      if (items.length) {
        toast.success('Books added to your cart at today\'s prices.')
        navigate('/cart')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId('')
    }
  }

  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />

  return (
    <div className="container page">
      <h1>My orders</h1>
      {data.length === 0 ? (
        <EmptyState title="No orders yet" text="When you place an order it will show up here, with tracking." to="/books" action="Start browsing" />
      ) : (
        data.map((o) => (
          <article className="card order" key={o._id} aria-label={`Order ${shortId(o._id)}`}>
            <div className="order-head">
              <div>
                <strong>Order #{shortId(o._id)}</strong>
                <div className="small muted">Placed {fmtDate(o.createdAt)}</div>
              </div>
              <span className={`pill ${o.status === 'delivered' ? 'pill-success' : o.status === 'cancelled' ? 'pill-danger' : 'pill-info'}`}>{o.status}</span>
              <strong>{money(o.total)}</strong>
            </div>
            <Tracking status={o.status} />
            <ul style={{ margin: '12px 0', paddingLeft: 18 }}>
              {o.items.map((i) => (
                <li key={i._id || i.book}>
                  <Link to={`/books/${i.book}`}>{i.title}</Link> x {i.qty} <span className="muted">({money(i.price)})</span>
                </li>
              ))}
            </ul>
            {o.discount > 0 && <p className="small discount">Coupon {o.couponCode} saved you {money(o.discount)}.</p>}
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => reorder(o)} disabled={busyId === o._id}>{busyId === o._id ? 'Adding...' : 'Reorder'}</button>
              <Link className="btn btn-sm" to={`/orders/${o._id}/invoice`}>Invoice</Link>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
