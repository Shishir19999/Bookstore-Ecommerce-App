import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, DEMO } from '../api'
import { useAuth, useCart, useCoupon, useFetch, useSettings, useTitle } from '../hooks'
import { EmptyState } from '../ui/States'
import { Field } from '../ui/Parts'
import OrderSummary from '../components/OrderSummary'
import { saveCoupon } from '../lib/coupon'
import { toItems } from '../lib/cart'
import { useQuote } from '../lib/useQuote'
import { FORMAT_LABEL, money, shortId } from '../lib/format'
import { isPhysical } from '../shared/rules.mjs'

const STEPS = ['Delivery', 'Savings and payment', 'Review']

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

function Confirmation({ order }) {
  const cards = order.items.filter((i) => i.code)
  const digital = order.items.some((i) => i.kind !== 'giftcard' && i.format && !isPhysical(i.format))
  return (
    <div className="container page">
      <div className="state" style={{ maxWidth: 560 }}>
        <svg className="state-art" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="none" strokeWidth="4" /><path d="M21 33l8 8 14-16" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h1 style={{ fontSize: '2rem' }}>Thank you for your order</h1>
        <p>
          Order <strong>#{shortId(order._id)}</strong> for {money(order.total)} is confirmed.{' '}
          {DEMO ? 'This is a live preview, so nobody was charged.' : 'This was a mock payment, nobody was charged.'}
          {order.status === 'preorder' && ' Your pre-order ships when the book is released.'}
        </p>
        {order.pointsEarned > 0 && <p className="alert alert-success">You earned {order.pointsEarned} reward points.</p>}
        {cards.length > 0 && (
          <div className="card" style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Your gift card{cards.length > 1 ? 's' : ''}</h2>
            {cards.map((c) => <p key={c.code} className="mono" style={{ margin: '4px 0' }}>{c.code} <span className="muted">({money(c.price)})</span></p>)}
            <p className="hint" style={{ marginBottom: 0 }}>Share the code with the recipient. It is also saved in your account.</p>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          {digital && <Link className="btn btn-primary" to="/library">Open my library</Link>}
          <Link className={`btn ${digital ? '' : 'btn-primary'}`} to="/orders">View my orders</Link>
          <Link className="btn" to={`/orders/${order._id}/invoice`}>Invoice</Link>
        </div>
      </div>
    </div>
  )
}

export default function Checkout() {
  useTitle('Checkout')
  const { user } = useAuth()
  const settings = useSettings()
  const { cart, clearCart } = useCart()
  const coupon = useCoupon(cart, true)
  const { data: config } = useFetch('/api/payments/config')
  const mode = config?.mode
  const hasPhysical = cart.some((l) => !l.giftCard && isPhysical(l.format))
  const [step, setStep] = useState(0)
  const [ship, setShip] = useState({ name: user?.name || '', address: '', city: '', postalCode: '', country: user?.country || settings.shipping.homeCountry })
  const [method, setMethod] = useState('standard')
  const [wrap, setWrap] = useState(false)
  const [giftMessage, setGiftMessage] = useState('')
  const [cardInput, setCardInput] = useState('')
  const [cardCode, setCardCode] = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [points, setPoints] = useState(0)
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [placed, setPlaced] = useState(null)
  const { quote, error: quoteError, loading } = useQuote(cart, user, settings, { couponCode: coupon.code, country: ship.country, method, giftWrap: wrap, giftMessage, giftCardCode: cardCode, points, enabled: !placed })
  const t = quote?.totals

  if (placed) return <Confirmation order={placed} />
  if (cart.length === 0)
    return (
      <div className="container page">
        <EmptyState title="Nothing to check out" text="Your cart is empty." to="/books" action="Browse books" />
      </div>
    )
  const needsCard = mode !== 'stripe' && (!t || t.amountDue > 0)
  const next = (e) => {
    e.preventDefault()
    const errs = step === 0 ? (hasPhysical ? checkShipping(ship) : {}) : step === 1 && needsCard ? checkCard(card) : {}
    setErrors(errs)
    if (Object.keys(errs).length === 0) setStep(step + 1)
  }
  const place = async () => {
    setBusy(true)
    setFailure('')
    try {
      // Only ids, formats, quantities, address and codes are sent; the server prices everything.
      const res = await api('/api/payments/checkout', {
        method: 'POST',
        body: { items: toItems(cart), shipping: ship, method, giftWrap: wrap, giftMessage: giftMessage || undefined, couponCode: coupon.code || undefined, giftCardCode: cardCode || undefined, points: points || undefined },
      })
      if (res.mode === 'stripe') {
        window.location.assign(res.url)
        return
      }
      clearCart()
      saveCoupon('')
      window.dispatchEvent(new Event('folio:notifications'))
      setPlaced(res.order)
    } catch (err) {
      setFailure(err.message)
      setBusy(false)
    }
  }
  const s = (k) => (e) => setShip({ ...ship, [k]: e.target.value })
  const c = (k) => (e) => setCard({ ...card, [k]: e.target.value })
  const maxPoints = t ? Math.min(user?.points || 0, t.maxPoints) : 0
  const countries = settings.countries || []
  return (
    <div className="container page">
      <h1>Checkout</h1>
      <ol className="steps" aria-label="Checkout steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i < step ? '✓' : i + 1}</span>{label}
          </li>
        ))}
      </ol>
      <div className="cart-layout">
        <section className="card">
          {step === 0 && (
            <form onSubmit={next} noValidate>
              {hasPhysical ? (
                <>
                  <h2>Where should we send it?</h2>
                  <Field label="Full name" autoComplete="name" value={ship.name} onChange={s('name')} error={errors.name} />
                  <Field label="Street address" autoComplete="street-address" value={ship.address} onChange={s('address')} error={errors.address} />
                  <div className="grid2">
                    <Field label="City" autoComplete="address-level2" value={ship.city} onChange={s('city')} error={errors.city} />
                    <Field label="Postal code" autoComplete="postal-code" value={ship.postalCode} onChange={s('postalCode')} error={errors.postalCode} />
                  </div>
                  <Field label="Country" as="select" autoComplete="country" value={ship.country} onChange={s('country')}>
                    {countries.map((co) => <option key={co.code} value={co.code}>{co.name}</option>)}
                  </Field>
                  <fieldset className="choice-group">
                    <legend>Delivery speed</legend>
                    {[['standard', 'Standard (3-6 days)', settings.shipping.standard], ['express', 'Express (1-2 days)', settings.shipping.express]].map(([v, label, price]) => (
                      <label key={v} className={`choice ${method === v ? 'on' : ''}`}>
                        <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} />
                        <span>{label}</span>
                        <span className="muted small">{v === 'standard' && t?.shippingFree ? 'Free' : money(price + (ship.country !== settings.shipping.homeCountry ? settings.shipping.international : 0))}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="choice-group">
                    <legend>Make it a gift</legend>
                    <label className="row"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Gift wrapping ({money(settings.giftWrap)})</label>
                    <Field label="Gift message (printed on a card, optional)" as="textarea" maxLength={200} rows={2} value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} hint={`${giftMessage.length}/200. Prices are not shown on the packing slip when there is a gift message.`} />
                  </fieldset>
                </>
              ) : (
                <>
                  <h2>Instant delivery</h2>
                  <p className="alert alert-info">Everything in your cart is digital: e-books and audiobooks appear in your library right after payment and gift card codes are shown on the confirmation page.</p>
                  <Field label="Billing country (for tax)" as="select" value={ship.country} onChange={s('country')}>
                    {countries.map((co) => <option key={co.code} value={co.code}>{co.name}</option>)}
                  </Field>
                </>
              )}
              <button className="btn btn-primary">Continue</button>
            </form>
          )}
          {step === 1 && (
            <form onSubmit={next} noValidate>
              <h2>Savings and payment</h2>
              <div className="grid2">
                <div>
                  <p className="label">Coupon</p>
                  {coupon.code ? (
                    <div className="row between"><span className={coupon.error ? 'err' : 'pill pill-success'}>{coupon.code}</span><button type="button" className="btn btn-ghost btn-sm" onClick={coupon.remove}>Remove</button></div>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>Apply coupon codes in your cart.</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="gc-code">Gift card</label>
                  {cardCode ? (
                    <div className="row between"><span className="pill pill-success mono">{cardCode}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setCardCode('')}>Remove</button></div>
                  ) : (
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <input id="gc-code" className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX" value={cardInput} onChange={(e) => setCardInput(e.target.value.toUpperCase())} autoComplete="off" />
                      <button type="button" className="btn btn-sm" onClick={() => cardInput.trim() && setCardCode(cardInput.trim())}>Apply</button>
                    </div>
                  )}
                </div>
              </div>
              {(user?.points || 0) > 0 && (
                <div className="field" style={{ marginTop: 14 }}>
                  <label htmlFor="pts">Reward points (you have {user.points}; 100 points = $1)</label>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input id="pts" className="input" type="number" min="0" max={maxPoints || undefined} value={pointsInput} onChange={(e) => setPointsInput(e.target.value)} placeholder={maxPoints ? `Up to ${maxPoints}` : '0'} />
                    <button type="button" className="btn btn-sm" onClick={() => setPoints(Math.max(0, Math.floor(Number(pointsInput) || 0)))}>Use points</button>
                    {points > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setPoints(0), setPointsInput(''))}>Clear</button>}
                  </div>
                  <span className="hint">At most half of the goods can be paid with points.</span>
                </div>
              )}
              {quoteError && <p className="alert alert-error" role="alert">{quoteError}</p>}
              <h3 style={{ marginTop: 18 }}>Payment</h3>
              {!mode ? (
                <p className="muted">Checking payment options...</p>
              ) : t && t.amountDue === 0 ? (
                <p className="alert alert-success">Nothing left to pay: your gift card and points cover the whole order.</p>
              ) : mode === 'stripe' ? (
                <p className="alert alert-info">You will be redirected to Stripe Checkout to pay securely (test mode: use card 4242 4242 4242 4242). The final total is calculated by the server.</p>
              ) : (
                <>
                  <p className="alert alert-info">{DEMO ? 'Live preview payment' : 'Mock payment'}: no real card is needed and nothing is charged. These details never leave this form.</p>
                  <Field label="Card number" inputMode="numeric" autoComplete="off" value={card.number} onChange={c('number')} error={errors.number} />
                  <div className="grid2">
                    <Field label="Expiry" placeholder="MM/YY" autoComplete="off" value={card.expiry} onChange={c('expiry')} error={errors.expiry} />
                    <Field label="Security code" inputMode="numeric" autoComplete="off" value={card.cvc} onChange={c('cvc')} error={errors.cvc} />
                  </div>
                </>
              )}
              <div className="row">
                <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-primary" disabled={!mode || !!quoteError}>Review order</button>
              </div>
            </form>
          )}
          {step === 2 && (
            <div>
              <h2>Review your order</h2>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Items in your order</caption>
                  <thead><tr><th>Item</th><th>Format</th><th className="num">Qty</th><th className="num">Price</th></tr></thead>
                  <tbody>
                    {cart.map((l) => (
                      <tr key={l.key}><td>{l.title}{l.bundle && <span className="pill pill-accent" style={{ marginLeft: 6 }}>Box set</span>}</td><td>{l.giftCard ? 'Gift card' : FORMAT_LABEL[l.format]}</td><td className="num">{l.qty}</td><td className="num">{money(l.price * l.qty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasPhysical && <p className="small" style={{ marginTop: 14 }}><strong>Ship to:</strong> {ship.name}, {ship.address}, {ship.city} {ship.postalCode}, {ship.country} ({method})</p>}
              {wrap && <p className="small"><strong>Gift wrapped</strong>{giftMessage && <>: &ldquo;{giftMessage}&rdquo;</>}</p>}
              <p className="small"><strong>Payment:</strong> {t && t.amountDue === 0 ? 'Gift card / points' : mode === 'stripe' ? 'Stripe Checkout (test mode)' : DEMO ? 'Live preview payment' : 'Mock payment'}</p>
              {quoteError && <p className="alert alert-error" role="alert">{quoteError}</p>}
              {coupon.error && <p className="alert alert-error" role="alert">{coupon.error} Remove the coupon in your cart to continue.</p>}
              {failure && <p className="alert alert-error" role="alert">{failure}</p>}
              <div className="row">
                <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>Back</button>
                <button type="button" className="btn btn-primary" onClick={place} disabled={busy || !!coupon.error || !!quoteError || !t}>
                  {busy ? 'Placing order...' : mode === 'stripe' && t?.amountDue > 0 ? 'Pay with Stripe' : `Place order (${money(t?.amountDue ?? 0)})`}
                </button>
              </div>
            </div>
          )}
        </section>
        <OrderSummary totals={t} couponCode={coupon.code} loading={loading} />
      </div>
    </div>
  )
}
