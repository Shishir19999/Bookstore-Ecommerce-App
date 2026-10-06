import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"];

const AdminOrders = () => {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ page, limit: 10 });
    if (status) q.set("status", status);
    api(`/api/admin/orders?${q}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id, newStatus) => {
    setError("");
    try {
      await api(`/api/admin/orders/${id}/status`, { method: "PATCH", body: { status: newStatus } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="cart-page admin-page" style={{ maxWidth: 900 }}>
      <h2>Manage orders</h2>
      <p><Link to="/admin/books">Books</Link></p>
      <label>
        Filter by status{" "}
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {!data ? (
        <p className="msg">Loading...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o._id}>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                  <td>{o.user ? `${o.user.name} (${o.user.email})` : "deleted user"}</td>
                  <td>{o.items.map((i) => `${i.title} x${i.qty}`).join(", ")}</td>
                  <td>{o.total}</td>
                  <td>{o.paymentStatus}</td>
                  <td>
                    <select aria-label="Order status" value={o.status || "placed"} onChange={(e) => update(o._id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {data.page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminOrders;
