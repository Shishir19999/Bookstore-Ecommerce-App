import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useCart, useCoupon, useFetch, useTitle } from '../hooks'
import { EmptyState } from '../ui/States'
import { OrderSummary } from './Cart'
import { saveCoupon } from '../lib/coupon'
import { money } from '../lib/format'

const STEPS = ['Shipping', 'Payment', 'Review']

function Field({ id, label, error, hint, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...props} />
      {error ? <span className="err" id={`${id}-err`}>{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

const checkShipping = (s) => {
  const e = {}
  if (s.name.trim().length < 2) e.name = 'Enter the recipient name.'
  if (s.address.trim().length < 5) e.address = 'Enter a street address.'
  if (s.city.trim().length < 2) e.city = 'Enter a city.'
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(s.postalCode.trim())) e.postalCode = 'Enter a valid postal code.'
  return e
}

const checkCard = (c) => {
  const e = {}
  if (!/^\d{16}$/.test(c.number.replace(/\s/g, ''))) e.number = 'Enter a 16 digit card number.'
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(c.expiry)
  if (!m || +m[1] < 1 || +m[1] > 12) e.expiry = 'Use MM/YY.'
  if (!/^\d{3,4}$/.test(c.cvc)) e.cvc = 'Enter the 3 digit code.'
  return e
}

export default function Checkout() {
  useTitle('Checkout')
  const { user } = useAuth()
  const { cart, totalPrice, clearCart } = useCart()
  const coupon = useCoupon(cart, true)
  const { data: config } = useFetch('/api/payments/config')
  const mode = config?.mode
  const [step, setStep] = useState(0)
  const [ship, setShip] = useState({ name: user?.name || '', address: '', city: '', postalCode: '' })
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [placed, setPlaced] = useState(null)

  if (placed)
    return (
      <div className="container page">
        <div className="state">
          <svg className="state-art" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="none" strokeWidth="4" /><path d="M21 33l8 8 14-16" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h1 style={{ fontSize: '2rem' }}>Thank you for your order</h1>
          <p>Order <strong>#{placed._id.slice(-6).toUpperCase()}</strong> for {money(placed.total)} is confirmed. This was a mock payment, nobody was charged.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" to="/orders">View my orders</Link>
            <Link className="btn" to={`/orders/${placed._id}/invoice`}>Invoice</Link>
          </div>
        </div>
      </div>
    )

  if (cart.length === 0)
    return (
      <div className="container page">
        <EmptyState title="Nothing to check out" text="Your cart is empty." to="/books" action="Browse books" />
      </div>
    )

  const next = (e) => {
    e.preventDefault()
    const errs = step === 0 ? checkShipping(ship) : step === 1 && mode !== 'stripe' ? checkCard(card) : {}
    setErrors(errs)
    if (Object.keys(errs).length === 0) setStep(step + 1)
  }

  const place = async () => {
    setBusy(true)
    setFailure('')
    try {
      // Only ids, quantities, shipping and the coupon code are sent; the server prices everything.
      const res = await api('/api/payments/checkout', {
        method: 'POST',
        body: { items: cart.map((l) => ({ book: l._id, qty: l.qty })), shipping: ship, couponCode: coupon.code || undefined },
      })
      if (res.mode === 'stripe') {
        window.location.assign(res.url)
        return
      }
      clearCart()
      saveCoupon('')
      setPlaced(res.order)
    } catch (err) {
      setFailure(err.message)
      setBusy(false)
    }
  }

  const set = (setter, obj) => (k) => (e) => setter({ ...obj, [k]: e.target.value })
  const s = set(setShip, ship)
  const c = set(setCard, card)

  return (
    <div className="container page">
      <h1>Checkout</h1>
      <ol className="steps" aria-label="Checkout steps">
        {STEPS.map((t, i) => (
          <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i < step ? '✓' : i + 1}</span>{t}
          </li>
        ))}
      </ol>
      <div className="cart-layout">
        <section className="card">
          {step === 0 && (
            <form onSubmit={next} noValidate>
              <h2>Where should we send it?</h2>
              <Field id="ship-name" label="Full name" autoComplete="name" value={ship.name} onChange={s('name')} error={errors.name} />
              <Field id="ship-address" label="Street address" autoComplete="street-address" value={ship.address} onChange={s('address')} error={errors.address} />
              <div className="grid2">
                <Field id="ship-city" label="City" autoComplete="address-level2" value={ship.city} onChange={s('city')} error={errors.city} />
                <Field id="ship-zip" label="Postal code" autoComplete="postal-code" value={ship.postalCode} onChange={s('postalCode')} error={errors.postalCode} />
              </div>
              <button className="btn btn-primary">Continue to payment</button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={next} noValidate>
              <h2>Payment</h2>
              {!mode ? (
                <p className="muted">Checking payment options...</p>
              ) : mode === 'stripe' ? (
                <p className="alert alert-info">You will be redirected to Stripe Checkout to pay securely (test mode: use card 4242 4242 4242 4242). The final total is calculated by the server.</p>
              ) : (
                <>
                  <p className="alert alert-info">Mock payment: no real card is needed and nothing is charged. These details never leave this form.</p>
                  <Field id="card-number" label="Card number" inputMode="numeric" autoComplete="off" value={card.number} onChange={c('number')} error={errors.number} />
                  <div className="grid2">
                    <Field id="card-exp" label="Expiry" placeholder="MM/YY" autoComplete="off" value={card.expiry} onChange={c('expiry')} error={errors.expiry} />
                    <Field id="card-cvc" label="Security code" inputMode="numeric" autoComplete="off" value={card.cvc} onChange={c('cvc')} error={errors.cvc} />
                  </div>
                </>
              )}
              <div className="row">
                <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-primary" disabled={!mode}>Review order</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div>
              <h2>Review your order</h2>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Items in your order</caption>
                  <thead><tr><th>Book</th><th className="num">Qty</th><th className="num">Price</th></tr></thead>
                  <tbody>
                    {cart.map((l) => (
                      <tr key={l._id}><td>{l.title}</td><td className="num">{l.qty}</td><td className="num">{money(l.price * l.qty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small" style={{ marginTop: 14 }}><strong>Ship to:</strong> {ship.name}, {ship.address}, {ship.city} {ship.postalCode}</p>
              <p className="small"><strong>Payment:</strong> {mode === 'stripe' ? 'Stripe Checkout (test mode)' : 'Mock payment'}</p>
              {coupon.error && <p className="alert alert-error" role="alert">{coupon.error} Remove the coupon in your cart to continue.</p>}
              {failure && <p className="alert alert-error" role="alert">{failure}</p>}
              <div className="row">
                <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>Back</button>
                <button type="button" className="btn btn-primary" onClick={place} disabled={busy || !!coupon.error}>
                  {busy ? 'Placing order...' : mode === 'stripe' ? 'Pay with Stripe' : `Place order (${money(totalPrice - coupon.discount)})`}
                </button>
              </div>
            </div>
          )}
        </section>
        <OrderSummary subtotal={totalPrice} discount={coupon.discount} code={coupon.code} />
      </div>
    </div>
  )
}
