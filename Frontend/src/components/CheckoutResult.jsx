import { useContext, useEffect } from "react";
import { Link } from "react-router-dom";
import { ItemCtx } from "../context/itemContextObject";

// Landing pages for Stripe Checkout redirects (/checkout/success and /checkout/cancel).
export const CheckoutSuccess = () => {
  const { clearCart } = useContext(ItemCtx);
  useEffect(() => {
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="cart-page">
      <h2>Payment received</h2>
      <p>Thank you! Your order is confirmed once Stripe notifies the store (usually within seconds).</p>
      <Link to="/orders">View my orders</Link>
    </div>
  );
};

export const CheckoutCancel = () => (
  <div className="cart-page">
    <h2>Payment cancelled</h2>
    <p>You were not charged. Your cart is unchanged.</p>
    <Link to="/cart">Back to cart</Link>
  </div>
);
