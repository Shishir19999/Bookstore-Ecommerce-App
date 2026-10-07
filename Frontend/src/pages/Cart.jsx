import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useCart, useConfirm, useCoupon, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { EmptyState } from '../ui/States'
import { authorPath, money } from '../lib/format'

export function OrderSummary({ subtotal, discount, code, children }) {
  return (
    <aside className="card sum" aria-label="Order summary">
      <h2 style={{ fontSize: '1.3rem' }}>Order summary</h2>
      <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
      {discount > 0 && <div className="discount"><span>Coupon {code}</span><span>-{money(discount)}</span></div>}
      <div><span>Shipping</span><span>Free</span></div>
      <div className="total"><span>Total</span><span>{money(Math.round((subtotal - discount) * 100) / 100)}</span></div>
      {children}
    </aside>
  )
}

export default function Cart() {
  useTitle('Your cart')
  const { cart, addToCart, removeFromCart, removeLine, clearCart, totalPrice } = useCart()
  const { user } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const coupon = useCoupon(cart, !!user)
  const [input, setInput] = useState('')

  if (cart.length === 0)
    return (
      <div className="container page">
        <EmptyState title="Your cart is empty" text="Browse the shelves and add a few books you would like to read." to="/books" action="Browse books" />
      </div>
    )

  const emptyCart = async () => {
    if (await confirm({ title: 'Empty your cart?', message: 'All books will be removed from the cart.', confirmLabel: 'Empty cart', danger: true })) {
      clearCart()
      coupon.remove()
    }
  }

  return (
    <div className="container page">
      <h1>Your cart</h1>
      <div className="cart-layout">
        <section className="card" aria-label="Cart items">
          {cart.map((l) => (
            <div className="line" key={l._id}>
              <Link to={`/books/${l._id}`}><Cover book={l} /></Link>
              <div>
                <Link to={`/books/${l._id}`} className="book-title">{l.title}</Link>
                <Link to={authorPath(l.author)} className="book-author">{l.author}</Link>
                <div className="small muted">{money(l.price)} each</div>
              </div>
              <div className="line-actions">
                <strong>{money(l.price * l.qty)}</strong>
                <div className="qty" role="group" aria-label={`Quantity of ${l.title}`}>
                  <button type="button" aria-label={`Remove one ${l.title}`} onClick={() => removeFromCart(l)}>-</button>
                  <output>{l.qty}</output>
                  <button type="button" aria-label={`Add one ${l.title}`} disabled={l.qty >= 20} onClick={() => addToCart(l)}>+</button>
                </div>
                <button type="button" className="btn btn-ghost btn-sm btn-outline-danger" onClick={() => { removeLine(l); toast.info(`Removed "${l.title}".`) }}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={emptyCart}>Empty cart</button>
        </section>

        <OrderSummary subtotal={totalPrice} discount={coupon.discount} code={coupon.code}>
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
            <p className="hint">Log in to use a coupon code.</p>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/checkout')}>Go to checkout</button>
          <Link to="/books" className="btn btn-ghost btn-block">Keep shopping</Link>
        </OrderSummary>
      </div>
    </div>
  )
}
