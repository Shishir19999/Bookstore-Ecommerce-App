import { Link, useParams } from 'react-router-dom'
import { useAuth, useFetch, useSettings, useTitle } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { FORMAT_LABEL, fmtDate, money, shortId } from '../lib/format'

// Printable invoice (use the Print button or the browser's print dialog to save it as a PDF).
// With `slip`, the same page renders a packing slip for staff: no prices, gift message and address first.
export default function Invoice({ slip = false }) {
  const { id } = useParams()
  const { user } = useAuth()
  const settings = useSettings()
  const { data: order, error, loading, reload } = useFetch(`/api/orders/${id}`)
  useTitle(order ? `${slip ? 'Packing slip' : 'Invoice'} ${shortId(order._id)}` : slip ? 'Packing slip' : 'Invoice')
  if (error && /not found/i.test(error)) return <div className="container page"><EmptyState title="Invoice not found" text="We could not find that order on your account." to="/orders" action="My orders" /></div>
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !order) return <PageSkeleton />
  const back = user?.role === 'user' ? '/orders' : '/manage/orders'
  const sh = order.shipping || {}
  const customer = order.customer || { name: user?.name, email: user?.email }
  const goods = order.items.filter((i) => i.kind !== 'giftcard')
  return (
    <div className="container page">
      <div className="row between no-print" style={{ maxWidth: 760, margin: '0 auto 16px' }}>
        <Link to={back}>&larr; Back to orders</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>{slip ? 'Print packing slip' : 'Print invoice'}</button>
      </div>
      <article className="invoice" aria-label={slip ? 'Packing slip' : 'Invoice'}>
        <div className="row between">
          <div>
            <h1 style={{ marginBottom: 2 }}>{slip ? 'Packing slip' : 'Invoice'}</h1>
            <div className="muted">#{shortId(order._id)}</div>
          </div>
          <div className="right">
            <strong>{settings.storeName}</strong>
            <div className="muted small">{slip ? 'Placed' : 'Issued'} {fmtDate(order.createdAt)}</div>
            {!slip && <div className="muted small">Payment: {order.paymentStatus}</div>}
            {order.shippingMethod && <div className="muted small">Delivery: {order.shippingMethod}</div>}
          </div>
        </div>
        <div className="row between" style={{ margin: '22px 0', alignItems: 'flex-start' }}>
          <div>
            <h3>{slip ? 'Customer' : 'Billed to'}</h3>
            <div>{customer.name}</div>
            <div className="muted">{customer.email}</div>
          </div>
          {(sh.address || sh.name) && (
            <div>
              <h3>Ship to</h3>
              <div>{sh.name}</div>
              <div className="muted">{sh.address}</div>
              <div className="muted">{[sh.city, sh.postalCode].filter(Boolean).join(' ')}</div>
              <div className="muted">{sh.country}</div>
            </div>
          )}
        </div>
        {order.gift && (
          <div className="gift-note">
            <strong>Gift{order.gift.wrap ? ' (please gift wrap)' : ''}</strong>
            {order.gift.message && <p style={{ margin: '4px 0 0' }}>&ldquo;{order.gift.message}&rdquo;</p>}
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Items</caption>
            <thead><tr><th>Item</th><th>Format</th><th className="num">Qty</th>{!slip && <><th className="num">Unit</th><th className="num">Amount</th></>}</tr></thead>
            <tbody>
              {order.items.map((i, k) => (
                <tr key={k}>
                  <td>{i.kind === 'giftcard' ? <>Gift card{i.code && <span className="mono small"> {i.code}</span>}</> : i.title}{i.preorder && ' (pre-order)'}</td>
                  <td>{i.kind === 'giftcard' ? 'Gift card' : FORMAT_LABEL[i.format || 'paperback']}</td>
                  <td className="num">{i.qty}</td>
                  {!slip && <><td className="num">{money(i.price)}</td><td className="num">{money(i.price * i.qty)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {slip ? (
          <p className="small muted" style={{ marginTop: 18 }}>{goods.length} line{goods.length === 1 ? '' : 's'}. Prices are not shown on this slip.</p>
        ) : (
          <div className="sum" style={{ maxWidth: 300, marginLeft: 'auto', marginTop: 16 }}>
            <div><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.bundleDiscount > 0 && <div><span>Box set discount</span><span>-{money(order.bundleDiscount)}</span></div>}
            {order.discount > 0 && <div><span>Coupon {order.couponCode}</span><span>-{money(order.discount)}</span></div>}
            {order.pointsDiscount > 0 && <div><span>{order.pointsUsed} reward points</span><span>-{money(order.pointsDiscount)}</span></div>}
            <div><span>Shipping</span><span>{order.shippingCost ? money(order.shippingCost) : 'Free'}</span></div>
            {order.giftWrap > 0 && <div><span>Gift wrapping</span><span>{money(order.giftWrap)}</span></div>}
            <div><span>Tax</span><span>{money(order.tax || 0)}</span></div>
            <div className="total"><span>Total</span><span>{money(order.total)}</span></div>
            {order.giftCardApplied > 0 && <div><span>Paid by gift card</span><span>{money(order.giftCardApplied)}</span></div>}
            {order.refundedTotal > 0 && <div><span>Refunded</span><span>-{money(order.refundedTotal)}</span></div>}
            {order.pointsEarned > 0 && <div className="small muted"><span>Points earned</span><span>{order.pointsEarned}</span></div>}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 24 }}>Thank you for reading with us.</p>
      </article>
    </div>
  )
}
