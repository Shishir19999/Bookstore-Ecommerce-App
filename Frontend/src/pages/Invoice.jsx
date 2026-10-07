import { Link, useParams } from 'react-router-dom'
import { useAuth, useFetch, useTitle } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { fmtDate, money } from '../lib/format'

// Printable invoice (use the Print button or the browser's print dialog to save it as a PDF).
export default function Invoice() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data, error, loading, reload } = useFetch('/api/orders/mine')
  const order = data?.find((o) => o._id === id)
  useTitle(order ? `Invoice ${order._id.slice(-6).toUpperCase()}` : 'Invoice')

  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />
  if (!order) return <div className="container page"><EmptyState title="Invoice not found" text="We could not find that order on your account." to="/orders" action="My orders" /></div>

  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.qty, 0)
  const sh = order.shipping || {}
  return (
    <div className="container page">
      <div className="row between no-print" style={{ maxWidth: 760, margin: '0 auto 16px' }}>
        <Link to="/orders">&larr; Back to orders</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print invoice</button>
      </div>
      <article className="invoice" aria-label="Invoice">
        <div className="row between">
          <div>
            <h1 style={{ marginBottom: 2 }}>Invoice</h1>
            <div className="muted">#{order._id.slice(-6).toUpperCase()}</div>
          </div>
          <div className="right">
            <strong>Folio Books</strong>
            <div className="muted small">Issued {fmtDate(order.createdAt)}</div>
            <div className="muted small">Payment: {order.paymentStatus}</div>
          </div>
        </div>
        <div className="row between" style={{ margin: '22px 0', alignItems: 'flex-start' }}>
          <div>
            <h3>Billed to</h3>
            <div>{user?.name}</div>
            <div className="muted">{user?.email}</div>
          </div>
          {(sh.address || sh.name) && (
            <div>
              <h3>Shipped to</h3>
              <div>{sh.name}</div>
              <div className="muted">{sh.address}</div>
              <div className="muted">{[sh.city, sh.postalCode].filter(Boolean).join(' ')}</div>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i._id || i.book}><td>{i.title}</td><td className="num">{i.qty}</td><td className="num">{money(i.price)}</td><td className="num">{money(i.price * i.qty)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sum" style={{ maxWidth: 280, marginLeft: 'auto', marginTop: 16 }}>
          <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {order.discount > 0 && <div><span>Coupon {order.couponCode}</span><span>-{money(order.discount)}</span></div>}
          <div><span>Shipping</span><span>Free</span></div>
          <div className="total"><span>Total</span><span>{money(order.total)}</span></div>
        </div>
        <p className="muted small" style={{ marginTop: 24 }}>Thank you for reading with us.</p>
      </article>
    </div>
  )
}
