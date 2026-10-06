import { useContext } from "react";
import { Link } from "react-router-dom";
import { ItemCtx } from "../context/itemContextObject";

const CartPage = () => {
  const { cart, addToCart, removeFromCart, removeLine, totalPrice } = useContext(ItemCtx);

  if (cart.length === 0)
    return (
      <div>
        <h2>Your cart is empty</h2>
        <p className="msg"><Link to="/">Browse books</Link></p>
      </div>
    );

  return (
    <div className="cart-page">
      <h2>Your Cart</h2>
      {cart.map((line) => (
        <div key={line._id} style={{ marginBottom: "10px" }}>
          <h3><Link to={`/books/${line._id}`}>{line.title}</Link></h3>
          <p>Price: {line.price} Rs x {line.qty} = {line.price * line.qty} Rs</p>
          <button onClick={() => removeFromCart(line)} aria-label="Decrease quantity">-</button>
          <span style={{ margin: "0 10px" }}>{line.qty}</span>
          <button onClick={() => addToCart(line)} aria-label="Increase quantity">+</button>{" "}
          <button onClick={() => removeLine(line)}>Remove</button>
        </div>
      ))}
      <h3>Total Price: {totalPrice} Rs</h3>
      <Link to="/checkout"><button>Proceed to checkout</button></Link>
    </div>
  );
};

export default CartPage;
