import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DEMO } from './api'
import UIProvider from './context/UIProvider'
import AuthProvider from './context/AuthContext'
import CartProvider from './context/ItemContext'
import ReadingListProvider from './context/ReadingListContext'
import SettingsProvider from './context/SettingsContext'
import Layout from './components/Layout'
import { ProtectedRoute, StaffRoute } from './components/Guards'
import { PageSkeleton } from './ui/States'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

const Browse = lazy(() => import('./pages/Browse'))
const BookDetail = lazy(() => import('./pages/BookDetail'))
const Genres = lazy(() => import('./pages/Genres'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'))
const CheckoutCancel = lazy(() => import('./pages/CheckoutCancel'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const Invoice = lazy(() => import('./pages/Invoice'))
const Returns = lazy(() => import('./pages/Returns'))
const ReadingList = lazy(() => import('./pages/ReadingList'))
const SharedWishlist = lazy(() => import('./pages/ReadingList').then((m) => ({ default: m.SharedWishlist })))
const ReadingLife = lazy(() => import('./pages/ReadingLife'))
const Library = lazy(() => import('./pages/Library'))
const Reader = lazy(() => import('./pages/Reader'))
const Listen = lazy(() => import('./pages/Listen'))
const Auth = lazy(() => import('./pages/Auth'))
const Account = lazy(() => import('./pages/Account'))
const GiftCards = lazy(() => import('./pages/Account').then((m) => ({ default: m.GiftCards })))
const Notifications = lazy(() => import('./pages/Account').then((m) => ({ default: m.Notifications })))
const Collections = lazy(() => import('./pages/Discover').then((m) => ({ default: m.Collections })))
const CollectionDetail = lazy(() => import('./pages/Discover').then((m) => ({ default: m.CollectionDetail })))
const SeriesDetail = lazy(() => import('./pages/Discover').then((m) => ({ default: m.SeriesDetail })))
const BundleDetail = lazy(() => import('./pages/Discover').then((m) => ({ default: m.BundleDetail })))
const Authors = lazy(() => import('./pages/Community').then((m) => ({ default: m.Authors })))
const Author = lazy(() => import('./pages/Community').then((m) => ({ default: m.Author })))
const Events = lazy(() => import('./pages/Community').then((m) => ({ default: m.Events })))
const Clubs = lazy(() => import('./pages/Community').then((m) => ({ default: m.Clubs })))
const ClubDetail = lazy(() => import('./pages/Community').then((m) => ({ default: m.ClubDetail })))
const ThreadView = lazy(() => import('./pages/Community').then((m) => ({ default: m.ThreadView })))

const Overview = lazy(() => import('./manage/Overview'))
const Inventory = lazy(() => import('./manage/Inventory'))
const BookForm = lazy(() => import('./manage/BookForm'))
const Isbn = lazy(() => import('./manage/Isbn'))
const ManageOrders = lazy(() => import('./manage/ManageOrders'))
const ManageReturns = lazy(() => import('./manage/ManageReturns'))
const Moderation = lazy(() => import('./manage/Moderation'))
const Catalog = lazy(() => import('./manage/Catalog'))
const Users = lazy(() => import('./manage/Users'))
const Coupons = lazy(() => import('./manage/Coupons'))
const GiftCardsAdmin = lazy(() => import('./manage/GiftCardsAdmin'))
const Reports = lazy(() => import('./manage/Reports'))
const Settings = lazy(() => import('./manage/Settings'))

const Router = DEMO ? HashRouter : BrowserRouter
const priv = (el) => <ProtectedRoute>{el}</ProtectedRoute>
const staff = (el) => <StaffRoute>{el}</StaffRoute>
const admin = (el) => <StaffRoute admin>{el}</StaffRoute>

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <SettingsProvider>
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
                      <Route path="/collections" element={<Collections />} />
                      <Route path="/collections/:slug" element={<CollectionDetail />} />
                      <Route path="/series/:slug" element={<SeriesDetail />} />
                      <Route path="/bundles/:slug" element={<BundleDetail />} />
                      <Route path="/authors" element={<Authors />} />
                      <Route path="/authors/:name" element={<Author />} />
                      <Route path="/events" element={<Events />} />
                      <Route path="/clubs" element={<Clubs />} />
                      <Route path="/clubs/:id" element={<ClubDetail />} />
                      <Route path="/clubs/:id/threads/:tid" element={<ThreadView />} />
                      <Route path="/gift-cards" element={<GiftCards />} />
                      <Route path="/wishlist/:token" element={<SharedWishlist />} />
                      <Route path="/read/:id" element={<Reader />} />
                      <Route path="/listen/:id" element={<Listen />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/login" element={<Auth mode="login" />} />
                      <Route path="/register" element={<Auth mode="register" />} />
                      <Route path="/checkout" element={priv(<Checkout />)} />
                      <Route path="/checkout/success" element={priv(<CheckoutSuccess />)} />
                      <Route path="/checkout/cancel" element={<CheckoutCancel />} />
                      <Route path="/orders" element={priv(<MyOrders />)} />
                      <Route path="/orders/:id/invoice" element={priv(<Invoice />)} />
                      <Route path="/orders/:id/packing-slip" element={staff(<Invoice slip />)} />
                      <Route path="/returns" element={priv(<Returns />)} />
                      <Route path="/library" element={priv(<Library />)} />
                      <Route path="/reading" element={priv(<ReadingLife />)} />
                      <Route path="/reading-list" element={priv(<ReadingList />)} />
                      <Route path="/account" element={priv(<Account />)} />
                      <Route path="/notifications" element={priv(<Notifications />)} />
                      <Route path="/admin/*" element={<Navigate to="/manage" replace />} />
                      <Route path="/manage" element={staff(<Overview />)} />
                      <Route path="/manage/books" element={staff(<Inventory />)} />
                      <Route path="/manage/books/new" element={staff(<BookForm />)} />
                      <Route path="/manage/books/:id/edit" element={staff(<BookForm />)} />
                      <Route path="/manage/isbn" element={staff(<Isbn />)} />
                      <Route path="/manage/orders" element={staff(<ManageOrders />)} />
                      <Route path="/manage/returns" element={staff(<ManageReturns />)} />
                      <Route path="/manage/moderation" element={staff(<Moderation />)} />
                      <Route path="/manage/catalog" element={staff(<Catalog />)} />
                      <Route path="/manage/users" element={admin(<Users />)} />
                      <Route path="/manage/coupons" element={admin(<Coupons />)} />
                      <Route path="/manage/giftcards" element={admin(<GiftCardsAdmin />)} />
                      <Route path="/manage/reports" element={admin(<Reports />)} />
                      <Route path="/manage/settings" element={admin(<Settings />)} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </Router>
            </ReadingListProvider>
          </CartProvider>
        </SettingsProvider>
      </AuthProvider>
    </UIProvider>
  )
}
