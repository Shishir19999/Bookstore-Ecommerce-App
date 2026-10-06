import { useEffect, useMemo, useState } from "react";

const CART_KEY = "bookstore_cart";
const MAX_QTY = 20; // matches server limit

import { ItemCtx } from "./itemContextObject";

const loadCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Cart lines: { _id, title, price, image, qty }.
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

  const addToCart = (book) =>
    setCart((prev) => {
      const line = prev.find((l) => l._id === book._id);
      if (line) {
        return prev.map((l) =>
          l._id === book._id ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l
        );
      }
      const { _id, title, price, image } = book;
      return [...prev, { _id, title, price, image, qty: 1 }];
    });

  // Removes one unit; the line disappears at zero
  const removeFromCart = (book) =>
    setCart((prev) =>
      prev.flatMap((l) =>
        l._id !== book._id ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []
      )
    );

  const removeLine = (book) => setCart((prev) => prev.filter((l) => l._id !== book._id));
  const clearCart = () => setCart([]);

  const { itemsInCart, totalPrice } = useMemo(
    () => ({
      itemsInCart: cart.reduce((n, l) => n + l.qty, 0),
      totalPrice: cart.reduce((sum, l) => sum + l.price * l.qty, 0),
    }),
    [cart]
  );

  return (
    <ItemCtx.Provider
      value={{ cart, addToCart, removeFromCart, removeLine, clearCart, itemsInCart, totalPrice }}
    >
      {children}
    </ItemCtx.Provider>
  );
}

export default CustomItemContext;
