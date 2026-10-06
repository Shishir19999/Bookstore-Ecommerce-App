import { useEffect, useState } from "react";
import { api } from "../api";

const MyOrders = () => {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/api/orders/mine")
      .then((o) => !cancelled && setOrders(o))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!orders) return <p className="msg">Loading...</p>;
  if (orders.length === 0) return <h2>You have no orders yet</h2>;

  return (
    <div className="cart-page">
      <h2>My Orders</h2>
      {orders.map((o) => (
        <div key={o._id} className="order-card">
          <p><strong>{new Date(o.createdAt).toLocaleString()}</strong> - {o.paymentStatus}</p>
          <ul>
            {o.items.map((it) => (
              <li key={it._id || it.book}>{it.title} x {it.qty} @ {it.price} Rs</li>
            ))}
          </ul>
          <p>Total: {o.total} Rs</p>
        </div>
      ))}
    </div>
  );
};

export default MyOrders;
