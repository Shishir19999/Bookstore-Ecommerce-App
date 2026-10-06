import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ItemCtx } from "../context/itemContextObject";
import { api } from "../api";

const Checkout = () => {
  const { cart, totalPrice, clearCart } = useContext(ItemCtx);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(null);
  const [mode, setMode] = useState(null); // 'mock' | 'stripe'

  useEffect(() => {
    api("/api/payments/config")
      .then((c) => setMode(c.mode))
      .catch(() => setMode("mock"));
  }, []);

  if (placed)
    return (
      <div className="cart-page">
        <h2>Order placed</h2>
        <p>Order {placed._id} - total {placed.total} Rs (mock payment, no real charge).</p>
        <Link to="/orders">View my orders</Link>
      </div>
    );

  if (cart.length === 0)
    return (
      <div>
        <h2>Your cart is empty</h2>
        <p className="msg"><Link to="/">Browse books</Link></p>
      </div>
    );

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      // Only book ids and quantities are sent; the server computes prices/total.
      const res = await api("/api/payments/checkout", {
        method: "POST",
        body: { items: cart.map((l) => ({ book: l._id, qty: l.qty })) },
      });
      if (res.mode === "stripe") {
        window.location.assign(res.url); // hosted Stripe Checkout; cart is cleared on the success page
        return;
      }
      clearCart();
      setPlaced(res.order);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="cart-page">
      <h2>Checkout</h2>
      {cart.map((l) => (
        <p key={l._id}>{l.title} x {l.qty}</p>
      ))}
      <h3>Estimated total: {totalPrice} Rs</h3>
      {mode === "stripe" ? (
        <p className="notice">
          You will be redirected to Stripe Checkout (TEST mode: use card 4242 4242 4242 4242). The final total is calculated by the server.
        </p>
      ) : (
        <p className="notice">
          MOCK PAYMENT: no card is needed and no real money is charged. The final total is calculated by the server.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button onClick={pay} disabled={busy || !mode}>
        {busy ? "Processing..." : mode === "stripe" ? "Pay with Stripe" : "Pay (mock)"}
      </button>
    </div>
  );
};

export default Checkout;
