import { money } from '../lib/format'

// Price breakdown for a quote's `totals` (the same fields the order stores).
export default function OrderSummary({ totals, couponCode, estimate = false, loading = false, children }) {
  const t = totals
  return (
    <aside className="card sum" aria-label="Order summary" aria-busy={loading}>
      <h2 style={{ fontSize: '1.3rem' }}>Order summary</h2>
      {!t ? (
        <p className="muted small">{loading ? 'Calculating...' : 'Add something to your cart to see the total.'}</p>
      ) : (
        <>
          <div><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
          {t.bundleDiscount > 0 && <div className="discount"><span>Box set discount</span><span>-{money(t.bundleDiscount)}</span></div>}
          {t.couponDiscount > 0 && <div className="discount"><span>Coupon {couponCode}</span><span>-{money(t.couponDiscount)}</span></div>}
          {t.pointsDiscount > 0 && <div className="discount"><span>{t.pointsUsed} reward points</span><span>-{money(t.pointsDiscount)}</span></div>}
          <div>
            <span>Shipping{t.shippingReason ? <small className="muted"> ({t.shippingReason})</small> : ''}</span>
            <span>{t.hasPhysical ? (t.shipping === 0 ? 'Free' : money(t.shipping)) : 'None'}</span>
          </div>
          {t.giftWrap > 0 && <div><span>Gift wrapping</span><span>{money(t.giftWrap)}</span></div>}
          <div><span>{estimate ? 'Estimated tax' : 'Tax'}</span><span>{money(t.tax)}</span></div>
          {t.giftCardApplied > 0 && <div className="discount"><span>Gift card</span><span>-{money(t.giftCardApplied)}</span></div>}
          <div className="total"><span>{t.giftCardApplied > 0 ? 'To pay' : 'Total'}</span><span>{money(t.amountDue)}</span></div>
          {t.pointsEarned > 0 && <p className="hint" style={{ margin: 0 }}>You will earn {t.pointsEarned} reward points.</p>}
          {estimate && <p className="hint" style={{ margin: 0 }}>Estimate for the United States. Log in for exact totals with discounts.</p>}
        </>
      )}
      {children}
    </aside>
  )
}
