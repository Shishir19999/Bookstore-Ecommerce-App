import { BrowserRouter as Router, Routes, Route} from "react-router-dom";
import Header from "./components/Header";
import ProductList from "./components/ProductList";
import CartPage from "./components/CartPage"; // you'll create this
import CustomItemContext from "./context/ItemContext";
import './App.css'


function App() {
  return (
    <CustomItemContext>
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/cart" element={<CartPage />} />
        </Routes>
      </Router>
    </CustomItemContext>
  );
}

export default App;
