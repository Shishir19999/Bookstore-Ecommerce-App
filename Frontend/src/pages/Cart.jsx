import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useCart, useConfirm, useCoupon, useSettings, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { EmptyState } from '../ui/States'
import { FormatIcon } from '../ui/Parts'
import OrderSummary from '../components/OrderSummary'
import { useQuote } from '../lib/useQuote'
import { FORMAT_LABEL, authorPath, money } from '../lib/format'
import { freeShippingProgress, isDigital, isPhysical } from '../shared/rules.mjs'

export default function Cart() {
  useTitle('Your cart')
  const { cart, addToCart, removeFromCart, removeLine, clearCart } = useCart()
  const { user } = useAuth()
  const settings = useSettings()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const coupon = useCoupon(cart, !!user)
  const { quote, error, loading } = useQuote(cart, user, settings, { couponCode: coupon.code })
  const [input, setInput] = useState('')

  if (cart.length === 0)
    return (
      <div className="container page">
        <EmptyState title="Your cart is empty" text="Browse the shelves and add a few books you would like to read." to="/books" action="Browse books" />
      </div>
    )
  const emptyCart = async () => {
    if (await confirm({ title: 'Empty your cart?', message: 'Everything will be removed from the cart.', confirmLabel: 'Empty cart', danger: true })) {
      clearCart()
      coupon.remove()
    }
  }
  const physical = cart.filter((l) => !l.giftCard && isPhysical(l.format)).reduce((s, l) => s + l.price * l.qty, 0)
  const ship = freeShippingProgress(physical, settings)
  const hasBundle = cart.some((l) => l.bundle)
  return (
    <div className="container page">
      <h1>Your cart</h1>
      <div className="cart-layout">
        <section className="card" aria-label="Cart items">
          {physical > 0 && (
            <div className="ship-progress" role="status">
              <p style={{ margin: '0 0 6px' }} className="small">
                {ship.remaining > 0 ? <>Add <strong>{money(ship.remaining)}</strong> of printed books for free standard shipping.</> : <strong>Your printed books ship free.</strong>}
              </p>
              <div className="meter" aria-hidden="true"><i style={{ width: `${ship.pct}%` }} /></div>
            </div>
          )}
          {cart.map((l) => (
            <div className="line" key={l.key}>
              {l.giftCard ? <div className="gc-thumb" aria-hidden="true">Gift card</div> : <Link to={`/books/${l._id}`}><Cover book={l} /></Link>}
              <div>
                {l.giftCard ? <strong className="book-title">Gift card</strong> : <Link to={`/books/${l._id}`} className="book-title">{l.title}</Link>}
                {!l.giftCard && <Link to={authorPath(l.author)} className="book-author">{l.author}</Link>}
                <div className="small muted">
                  {l.giftCard ? <>For {l.giftCard.toName || 'a reader'}{l.giftCard.toEmail ? ` (${l.giftCard.toEmail})` : ''}</> : <><FormatIcon type={l.format} /> {FORMAT_LABEL[l.format]} &middot; {money(l.price)}{isPhysical(l.format) ? ' each' : ''}</>}
                  {l.bundle && <span className="pill pill-accent" style={{ marginLeft: 6 }}>Box set</span>}
                </div>
              </div>
              <div className="line-actions">
                <strong>{money(l.price * l.qty)}</strong>
                {!l.giftCard && isPhysical(l.format) ? (
                  <div className="qty" role="group" aria-label={`Quantity of ${l.title}`}>
                    <button type="button" aria-label={`Remove one ${l.title}`} onClick={() => removeFromCart(l)}>-</button>
                    <output>{l.qty}</output>
                    <button type="button" aria-label={`Add one ${l.title}`} disabled={l.qty >= 20} onClick={() => addToCart({ _id: l._id, title: l.title, author: l.author, genre: l.genre, image: l.image, formats: [{ type: l.format, price: l.price }] }, 1, l.format)}>+</button>
                  </div>
                ) : (
                  <span className="small muted">{isDigital(l.format) ? 'Digital, 1 copy' : 'Delivered by e-mail code'}</span>
                )}
                <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => { removeLine(l); toast.info(`Removed "${l.title}".`) }}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={emptyCart}>Empty cart</button>
        </section>
        <div className="stack">
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <OrderSummary totals={quote?.totals} couponCode={coupon.code} estimate={quote?.estimate} loading={loading}>
            {hasBundle && quote && !quote.totals.bundleDiscount && !quote.estimate && <p className="hint">Add every book of the box set to unlock its discount.</p>}
            {user ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (input.trim()) {
                    coupon.apply(input)
                    setInput('')
                  }
                }}
              >
                <label className="label" htmlFor="coupon">Coupon code</label>
                {coupon.code ? (
                  <div className="row between">
                    <span className={coupon.error ? 'err' : 'pill pill-success'}>{coupon.code}{coupon.info && coupon.info.type === 'percent' ? ` (${coupon.info.value}% off)` : ''}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={coupon.remove}>Remove</button>
                  </div>
                ) : (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input id="coupon" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. WELCOME10" autoComplete="off" />
                    <button className="btn btn-sm">Apply</button>
                  </div>
                )}
                {coupon.error && <p className="err" role="alert">{coupon.error}</p>}
              </form>
            ) : (
              <p className="hint">Log in to use coupons, reward points and gift cards.</p>
            )}
            <button type="button" className="btn btn-primary btn-block" disabled={!!error} onClick={() => navigate('/checkout')}>Go to checkout</button>
            <Link to="/books" className="btn btn-ghost btn-block">Keep shopping</Link>
          </OrderSummary>
        </div>
      </div>
    </div>
  )
}
