import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import ProductList from "./components/ProductList";
import BookDetail from "./components/BookDetail";
import CartPage from "./components/CartPage";
import Checkout from "./components/Checkout";
import MyOrders from "./components/MyOrders";
import AuthForm from "./components/AuthForm";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AdminBooks from "./components/AdminBooks";
import AdminBookForm from "./components/AdminBookForm";
import AdminOrders from "./components/AdminOrders";
import { CheckoutSuccess, CheckoutCancel } from "./components/CheckoutResult";
import CustomItemContext from "./context/ItemContext";
import AuthProvider from "./context/AuthContext";
import './App.css'

function App() {
  return (
    <AuthProvider>
      <CustomItemContext>
        <Router>
          <Header />
          <Routes>
            <Route path="/" element={<ProductList />} />
            <Route path="/books/:id" element={<BookDetail />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/login" element={<AuthForm mode="login" />} />
            <Route path="/register" element={<AuthForm mode="register" />} />
            <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
            <Route path="/checkout/success" element={<ProtectedRoute><CheckoutSuccess /></ProtectedRoute>} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/admin" element={<Navigate to="/admin/books" replace />} />
            <Route path="/admin/books" element={<AdminRoute><AdminBooks /></AdminRoute>} />
            <Route path="/admin/books/new" element={<AdminRoute><AdminBookForm /></AdminRoute>} />
            <Route path="/admin/books/:id/edit" element={<AdminRoute><AdminBookForm /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
            <Route path="*" element={<h2>Page not found</h2>} />
          </Routes>
        </Router>
      </CustomItemContext>
    </AuthProvider>
  );
}

export default App;
