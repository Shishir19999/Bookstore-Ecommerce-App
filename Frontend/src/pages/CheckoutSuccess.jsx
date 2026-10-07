import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart, useTitle } from '../hooks'
import { saveCoupon } from '../lib/coupon'

// Landing page after Stripe Checkout (test mode) redirects back to the store.
export default function CheckoutSuccess() {
  useTitle('Payment received')
  const { clearCart } = useCart()
  useEffect(() => {
    clearCart()
    saveCoupon('')
  }, [clearCart])
  return (
    <div className="container page">
      <div className="state">
        <h1 style={{ fontSize: '2rem' }}>Payment received</h1>
        <p>Thank you! Your order is confirmed as soon as Stripe notifies the store, usually within a few seconds.</p>
        <Link className="btn btn-primary" to="/orders">View my orders</Link>
      </div>
    </div>
  )
}
