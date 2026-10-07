import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DEMO } from './api'
import UIProvider from './context/UIProvider'
import AuthProvider from './context/AuthContext'
import CartProvider from './context/ItemContext'
import ReadingListProvider from './context/ReadingListContext'
import Layout from './components/Layout'
import { ProtectedRoute, AdminRoute } from './components/Guards'
import { PageSkeleton } from './ui/States'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

const Browse = lazy(() => import('./pages/Browse'))
const BookDetail = lazy(() => import('./pages/BookDetail'))
const Author = lazy(() => import('./pages/Author'))
const Genres = lazy(() => import('./pages/Genres'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'))
const CheckoutCancel = lazy(() => import('./pages/CheckoutCancel'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const Invoice = lazy(() => import('./pages/Invoice'))
const ReadingList = lazy(() => import('./pages/ReadingList'))
const Auth = lazy(() => import('./pages/Auth'))
const AdminDashboard = lazy(() => import('./admin/Dashboard'))
const AdminBooks = lazy(() => import('./admin/Books'))
const AdminBookForm = lazy(() => import('./admin/BookForm'))
const AdminOrders = lazy(() => import('./admin/Orders'))
const AdminCoupons = lazy(() => import('./admin/Coupons'))

const Router = DEMO ? HashRouter : BrowserRouter

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <CartProvider>
          <ReadingListProvider>
            <Router>
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/books" element={<Browse />} />
                    <Route path="/books/:id" element={<BookDetail />} />
                    <Route path="/genres" element={<Genres />} />
                    <Route path="/authors/:name" element={<Author />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/login" element={<Auth mode="login" />} />
                    <Route path="/register" element={<Auth mode="register" />} />
                    <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                    <Route path="/checkout/success" element={<ProtectedRoute><CheckoutSuccess /></ProtectedRoute>} />
                    <Route path="/checkout/cancel" element={<CheckoutCancel />} />
                    <Route path="/orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
                    <Route path="/orders/:id/invoice" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
                    <Route path="/reading-list" element={<ProtectedRoute><ReadingList /></ProtectedRoute>} />
                    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                    <Route path="/admin/books" element={<AdminRoute><AdminBooks /></AdminRoute>} />
                    <Route path="/admin/books/new" element={<AdminRoute><AdminBookForm /></AdminRoute>} />
                    <Route path="/admin/books/:id/edit" element={<AdminRoute><AdminBookForm /></AdminRoute>} />
                    <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
                    <Route path="/admin/coupons" element={<AdminRoute><AdminCoupons /></AdminRoute>} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </ReadingListProvider>
        </CartProvider>
      </AuthProvider>
    </UIProvider>
  )
}
