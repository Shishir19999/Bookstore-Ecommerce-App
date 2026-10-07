# Folio Books (Bookstore E-commerce)

A full-stack online bookstore: React 19 + Vite frontend, Express 5 + MongoDB backend, Stripe Checkout in test mode (with a labelled mock fallback) and an admin area.

**Live demo (browser-only, no backend, no real payments): https://shishir19999.github.io/Bookstore-Ecommerce-App/**

Requires Node.js 24 LTS (Docker images: node:24, nginx:1.30, mongo:8.0).

## Features

- Browse by **genre**, **author pages**, advanced search and filters (genre, price range, rating, language, in stock) with sorting; every filter lives in the URL so views can be bookmarked and shared.
- Book detail with description, **preview excerpt**, reviews and star ratings (one review per user, rating breakdown), and **"readers also liked"** recommendations.
- **Reading list / wishlist** with statuses: want to read, reading, finished.
- Bestseller strip and new-arrival section on the home page.
- Cart (persisted), **coupons** (percent or fixed, minimum spend, expiry, usage limit), **multi-step checkout** (shipping, payment, review), stock enforced server-side.
- Order history with **tracking**, **reorder** and a **printable invoice**.
- **Admin**: dashboard with a sales chart, top sellers and low-stock alerts; inventory and book CRUD with cover upload; order status management; coupon management.
- Design system with light/dark theme (follows the system, remembered), skeleton loaders, empty and error states, toasts, confirm dialogs, inline form validation, 404 page, lazy images, accessible markup, responsive from 320px.
- Offline-safe SVG cover art for books without an image.

### Parallax and scroll motion

The home page hero, genre banners, bestseller band and section backgrounds use parallax and scroll-reveal built from `IntersectionObserver` and one `requestAnimationFrame` loop, animating only `transform` and `opacity` (no libraries). It is switched off for `prefers-reduced-motion`, data-saver, small screens (720px and below) and low-power devices, and is never used on the cart, checkout or admin pages. See `Frontend/src/lib/motion.js`.

## Run it

### Full-stack mode (real API, Stripe test mode or mock payments)

1. `npm install` in the root, `Backend` and `Frontend`.
2. Copy `Backend/.env.example` to `Backend/.env` and set `PORT`, `MONGO_URI` and `JWT_SECRET` (required). Copy `Frontend/.env.example` to `Frontend/.env` (`VITE_API_URL`).
3. Start MongoDB, then `npm start` in the root (backend and frontend together), or `npm run dev` in `Backend` and `Frontend` separately.
4. Optional sample data: `npm run seed` in `Backend` (idempotent; adds 64 books across 8 genres with reviews, 20 users, 50 orders and 3 coupons).

Seed logins (password `Password123!`, local demo data only): `admin@example.com` (admin) and `user@example.com`. On first start, if no admin exists and `ADMIN_PASSWORD` is set, `ADMIN_EMAIL` is created as admin. Registration always creates role `user`.

### Browser-only demo mode

The demo swaps the API layer for an in-browser backend (`Frontend/src/demo`) with the same interface: 64 seeded books across 8 genres, bundled SVG cover art, localStorage persistence, simulated latency and a mock payment. Nothing leaves the browser.

```
cd Frontend
npm run dev:demo      # local demo with hot reload
npm run build:pages   # static build in Frontend/dist, base /Bookstore-Ecommerce-App/, hash routing
```

Demo logins (shown on the login screen; password `Password123!`):

| Role | Email |
| --- | --- |
| Shopper | `user@example.com` |
| Admin | `admin@example.com` |

Demo coupons: `WELCOME10` (10% off) and `READMORE5` ($5 off orders over $30). A banner marks demo mode and **Reset demo data** restores the seed. Publish the contents of `Frontend/dist` to GitHub Pages.

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | - | `{name?, email, password}` -> `{token, user}` |
| GET | `/api/auth/me` | Bearer | current user; 401 if revoked |
| POST | `/api/auth/logout` | Bearer | revokes all issued tokens |
| GET | `/api/books` | - | `?search=&genre=&language=&author=&minPrice=&maxPrice=&minRating=&inStock=&sort=&page=&limit=` -> books plus facets |
| GET | `/api/books/featured` | - | bestsellers, new arrivals, genres |
| GET | `/api/books/author/:name` | - | author's books and stats |
| GET | `/api/books/:id`, `/api/books/:id/related` | - | detail, "readers also liked" |
| GET/POST/DELETE | `/api/books/:id/reviews` | POST/DELETE Bearer | one review per user |
| POST/PUT/DELETE | `/api/books[/:id]` | Admin | JSON or multipart (`cover` file, JPEG/PNG/WebP/GIF <= 2MB) |
| GET/PUT/DELETE | `/api/me/reading-list[/:bookId]` | Bearer | status `want`, `reading`, `finished` |
| POST | `/api/coupons/validate` | Bearer | `{code, items}` -> discount for the current cart |
| GET | `/api/payments/config` | - | `{mode: "stripe"|"mock"}` |
| POST | `/api/payments/checkout` | Bearer | `{items, shipping, couponCode}` -> Stripe `{mode:"stripe", url}` or mock `{mode:"mock", order}` |
| POST | `/api/payments/webhook` | Stripe signature | marks the order paid |
| GET | `/api/orders/mine`, POST `/api/orders/:id/reorder` | Bearer | history, reorder at current prices |
| GET | `/api/admin/stats` | Admin | totals, sales per day, top books, low stock |
| GET/PATCH | `/api/admin/orders[/:id/status]` | Admin | list and update status |
| GET/POST/PUT/DELETE | `/api/admin/coupons[/:id]` | Admin | coupon management |

Errors are JSON: `{ "error": "message" }`. Prices and discounts are always computed on the server from the database.

## Payments (Stripe test mode)

Set in `Backend/.env`: `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`) and `FRONTEND_URL`. Forward webhooks locally with `stripe listen --forward-to localhost:5000/api/payments/webhook` and pay with test card 4242 4242 4242 4242. Without a Stripe key the labelled mock path is used. Stripe is unit-tested with a mocked client only.

## Tests and checks

- `npm test` in `Backend` (node:test + supertest, needs local MongoDB; uses throwaway databases that are dropped afterwards).
- `npm run lint` and `npm run build` in `Frontend`.

## Deploy with Docker

```
export JWT_SECRET=$(openssl rand -hex 32)      # required
# optional: ADMIN_PASSWORD, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FRONTEND_URL, VITE_API_URL
docker compose up --build
```

Frontend (nginx) on http://localhost:8080, API on http://localhost:5000, MongoDB data in the `mongo-data` volume, uploaded covers in the `uploads` volume. `VITE_API_URL` is baked in at build time. In production, terminate TLS in front and restrict CORS.
