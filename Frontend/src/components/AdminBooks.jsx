import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageSrc } from "../api";

const AdminBooks = () => {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ page, limit: 10, search });
    api(`/api/books?${q}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (b) => {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    try {
      await api(`/api/books/${b._id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="cart-page admin-page" style={{ maxWidth: 900 }}>
      <h2>Manage books</h2>
      <p>
        <Link to="/admin/books/new">+ Add book</Link> | <Link to="/admin/orders">Orders</Link>
      </p>
      <input
        placeholder="Search title or author"
        aria-label="Search books"
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
      />
      {error && <p className="error" role="alert">{error}</p>}
      {!data ? (
        <p className="msg">Loading...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr><th>Cover</th><th>Title</th><th>Author</th><th>Genre</th><th>Price</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.books.map((b) => (
                <tr key={b._id}>
                  <td><img src={imageSrc(b.image)} alt="" width="40" height="40" style={{ objectFit: "cover" }} /></td>
                  <td>{b.title}</td>
                  <td>{b.author}</td>
                  <td>{b.genre}</td>
                  <td>{b.price}</td>
                  <td>
                    <Link to={`/admin/books/${b._id}/edit`}>Edit</Link>{" "}
                    <button onClick={() => remove(b)}>Delete</button>
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

export default AdminBooks;
