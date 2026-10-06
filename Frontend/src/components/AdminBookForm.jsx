import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

const empty = { title: "", author: "", genre: "", description: "", price: "", image: "" };

// Add (no :id) or edit (:id) a book. Cover = uploaded file (<=2MB image) or an image URL.
const AdminBookForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    api(`/api/books/${id}`)
      .then((b) =>
        setForm({
          title: b.title || "",
          author: b.author || "",
          genre: b.genre || "",
          description: b.description || "",
          price: String(b.price ?? ""),
          image: b.image?.startsWith("/uploads/") ? "" : b.image || "",
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (file && file.size > 2 * 1024 * 1024) return setError("Cover image must be 2MB or smaller");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "image" && !v) return; // keep the existing cover when blank
        fd.append(k, v);
      });
      if (file) fd.append("cover", file);
      await api(id ? `/api/books/${id}` : "/api/books", { method: id ? "PUT" : "POST", body: fd });
      navigate("/admin/books");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (loading) return <p className="msg">Loading...</p>;

  return (
    <form className="form-card" onSubmit={submit} style={{ maxWidth: 520 }}>
      <h2>{id ? "Edit book" : "Add book"}</h2>
      <label>Title<input value={form.title} onChange={set("title")} required maxLength={200} /></label>
      <label>Author<input value={form.author} onChange={set("author")} required maxLength={120} /></label>
      <label>Genre<input value={form.genre} onChange={set("genre")} maxLength={60} /></label>
      <label>Price<input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} required /></label>
      <label>Description<textarea value={form.description} onChange={set("description")} maxLength={2000} rows={4} /></label>
      <label>Cover image URL<input type="url" value={form.image} onChange={set("image")} placeholder="https://..." /></label>
      <label>
        ...or upload a cover (JPEG/PNG/WebP/GIF, max 2MB)
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files[0] || null)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      <Link to="/admin/books">Cancel</Link>
    </form>
  );
};

export default AdminBookForm;
