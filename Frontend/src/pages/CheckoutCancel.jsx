import { Link } from 'react-router-dom'
import { useTitle } from '../hooks'

export default function CheckoutCancel() {
  useTitle('Payment cancelled')
  return (
    <div className="container page">
      <div className="state">
        <h1 style={{ fontSize: '2rem' }}>Payment cancelled</h1>
        <p>You were not charged and your cart is unchanged.</p>
        <Link className="btn btn-primary" to="/cart">Back to cart</Link>
      </div>
    </div>
  )
}
