import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemCtx } from "./itemContextObject";

const CART_KEY = "bookstore_cart";
const MAX_QTY = 20; // matches server limit

const loadCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toLine = (book, qty) => {
  const { _id, title, author, genre, price, image } = book;
  return { _id, title, author, genre, price, image, qty };
};

// Cart lines: { _id, title, author, genre, price, image, qty }.
// Prices here are for display only; the server recomputes totals from the DB.
function CustomItemContext({ children }) {
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* storage unavailable */
    }
  }, [cart]);

  const addToCart = useCallback(
    (book, qty = 1) =>
      setCart((prev) => {
        const line = prev.find((l) => l._id === book._id);
        if (line) {
          return prev.map((l) => (l._id === book._id ? { ...l, qty: Math.min(l.qty + qty, MAX_QTY) } : l));
        }
        return [...prev, toLine(book, Math.min(qty, MAX_QTY))];
      }),
    []
  );

  // Adds several lines at once (used by "reorder")
  const addLines = useCallback(
    (lines) =>
      setCart((prev) => {
        const next = [...prev];
        for (const b of lines) {
          const i = next.findIndex((l) => l._id === b._id);
          if (i >= 0) next[i] = { ...next[i], qty: Math.min(next[i].qty + b.qty, MAX_QTY), price: b.price };
          else next.push(toLine(b, Math.min(b.qty, MAX_QTY)));
        }
        return next;
      }),
    []
  );

  // Removes one unit; the line disappears at zero
  const removeFromCart = useCallback(
    (book) =>
      setCart((prev) =>
        prev.flatMap((l) => (l._id !== book._id ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []))
      ),
    []
  );

  const removeLine = useCallback((book) => setCart((prev) => prev.filter((l) => l._id !== book._id)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const { itemsInCart, totalPrice } = useMemo(
    () => ({
      itemsInCart: cart.reduce((n, l) => n + l.qty, 0),
      totalPrice: Math.round(cart.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100,
    }),
    [cart]
  );

  const value = useMemo(
    () => ({ cart, addToCart, addLines, removeFromCart, removeLine, clearCart, itemsInCart, totalPrice }),
    [cart, addToCart, addLines, removeFromCart, removeLine, clearCart, itemsInCart, totalPrice]
  );

  return <ItemCtx.Provider value={value}>{children}</ItemCtx.Provider>;
}

export default CustomItemContext;
