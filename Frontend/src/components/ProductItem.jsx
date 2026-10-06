import { useContext } from "react";
import { Link } from "react-router-dom";
import { imageSrc } from "../api";
import { ItemCtx } from "../context/itemContextObject";

const ProductItem = ({ product }) => {
	const { addToCart, removeFromCart } = useContext(ItemCtx);

	return (
		<li className="product-card">
			<Link to={`/books/${product._id}`}>
				<img className="product-image" src={imageSrc(product.image)} alt={product.title} />
			</Link>

			<div className="product-details">
				<h3 style={{ fontWeight: "700" }}>
					<Link to={`/books/${product._id}`}>{product.title}</Link>
				</h3>
				<p style={{ fontWeight: "500" }}>Price: {product.price} Rs</p>
				<p>{product.genre}</p>
				<p style={{ fontWeight: "700", color: "brown" }}>{product.author}</p>

				<button onClick={() => addToCart(product)}>Add to Cart</button>
				<button onClick={() => removeFromCart(product)} aria-label="Remove one from cart">-</button>
			</div>
		</li>
	);
};

export default ProductItem;
