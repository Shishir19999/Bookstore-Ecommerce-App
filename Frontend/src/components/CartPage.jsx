import React, { useContext } from "react";
import { itemContext } from "../context/ItemContext";

const CartPage = () => {
  const { cart, removeFromCart, totalPrice } = useContext(itemContext);

  if (!cart || cart.length === 0) return <h2>Your cart is empty</h2>;

  return (
    <div>
      <h2>Your Cart</h2>
      {cart.map((product) => (
        <div key={product._id} style={{ marginBottom: "10px" }}>
          <h3>{product.title}</h3>
          <p>Price: {product.price} Rs</p>
          <button onClick={() => removeFromCart(product)}>Remove</button>
        </div>
      ))}
      <h3>Total Price: {totalPrice} Rs</h3>
    </div>
  );
};

export default CartPage;
