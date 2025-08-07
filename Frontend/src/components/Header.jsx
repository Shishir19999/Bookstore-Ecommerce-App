import React, { useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { itemContext } from "../context/ItemContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCartShopping } from "@fortawesome/free-solid-svg-icons";

const Header = () => {
  const navigate = useNavigate();
  const { itemsInCart, totalPrice } = useContext(itemContext);

  return (
    <div className="header">
 <h1 className="gfg">
        <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>
          GFG Book Store
        </Link>
      </h1>      <h3 style={{ color: "green" }}>Total Price: {totalPrice}</h3>

      <div className="cart-num" onClick={() => navigate("/cart")}>
        <div className="cart-items">{itemsInCart}</div>
        <FontAwesomeIcon icon={faCartShopping} size="4x" />
      </div>
    </div>
  );
};

export default Header;
