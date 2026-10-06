import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ItemCtx } from "../context/itemContextObject";
import { AuthCtx } from "../context/authContextObject";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCartShopping } from "@fortawesome/free-solid-svg-icons";

const Header = () => {
  const navigate = useNavigate();
  const { itemsInCart, totalPrice } = useContext(ItemCtx);
  const { user, logout } = useContext(AuthCtx);

  return (
    <div className="header">
      <h1 className="title">
        <Link to="/" style={{ color: "white", textDecoration: "none" }}>
          Book Store
        </Link>
      </h1>
      <h3 style={{ color: "green" }}>Total Price: {totalPrice}</h3>

      <nav className="user-menu">
        {user ? (
          <>
            <span>Hi, {user.name}</span>
            <Link to="/orders">My orders</Link>
            {user.role === "admin" && <Link to="/admin/books">Admin</Link>}
            <button
              onClick={async () => {
                await logout();
                navigate("/");
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>

      <div
        className="cart-num"
        role="link"
        aria-label={`Cart, ${itemsInCart} items`}
        onClick={() => navigate("/cart")}
      >
        <div className="cart-items">{itemsInCart}</div>
        <FontAwesomeIcon icon={faCartShopping} size="4x" />
      </div>
    </div>
  );
};

export default Header;
