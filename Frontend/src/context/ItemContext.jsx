import { createContext, useEffect, useState } from "react";

const itemContext = createContext();

// creating custom provider
function CustomItemContext({ children }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [itemsInCart, setItemsInCart] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch("http://localhost:5000/api/books");
      const products = await response.json();
      console.log(products);
      setProducts(products);
    };

    fetchData();
  }, []);

  const addToCart = (product) => {
    setTotalPrice((prev) => prev + product.price);
    setCart((prevCart) => [...prevCart, product]);
    setItemsInCart((prevCount) => prevCount + 1);
  };

  const removeFromCart = (product) => {
  setCart((prevCart) => {
    const index = prevCart.findIndex((prdt) => prdt._id === product._id);
    if (index === -1) return prevCart; // item not found, no change

    const updatedCart = [...prevCart];
    updatedCart.splice(index, 1);

    // Calculate new total price and items count
    const newTotalPrice = updatedCart.reduce((sum, item) => sum + item.price, 0);
    const newItemsInCart = updatedCart.length;

    // Update related states based on new cart
    setTotalPrice(newTotalPrice);
    setItemsInCart(newItemsInCart);

    return updatedCart;
  });
};


  return (
    <itemContext.Provider
      value={{
        products,
        cart,             // Added cart here
        addToCart,
        removeFromCart,
        itemsInCart,
        totalPrice,
      }}
    >
      {children}
    </itemContext.Provider>
  );
}

export { itemContext };
export default CustomItemContext;
