import { useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ItemCtx } from "../context/itemContextObject";
import { api, imageSrc } from "../api";

const BookDetail = () => {
  const { id } = useParams();
  const { addToCart } = useContext(ItemCtx);
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before refetch when :id changes
    setBook(null);
    setError("");
    api(`/api/books/${id}`)
      .then((b) => !cancelled && setBook(b))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!book) return <p className="msg">Loading...</p>;

  return (
    <div className="book-detail">
      <img className="detail-image" src={imageSrc(book.image)} alt={book.title} />
      <div>
        <h2 style={{ textAlign: "left" }}>{book.title}</h2>
        <p style={{ fontWeight: 700, color: "brown" }}>{book.author}</p>
        <p>Genre: {book.genre}</p>
        <p>{book.description}</p>
        <p style={{ fontWeight: 500 }}>Price: {book.price} Rs</p>
        <button onClick={() => addToCart(book)}>Add to Cart</button>{" "}
        <Link to="/">Back to list</Link>
      </div>
    </div>
  );
};

export default BookDetail;
