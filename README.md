# Bookstore E-commerce

React (Vite) frontend + Express/MongoDB backend: browse/search books, register/login (JWT with server-side logout revocation), persistent cart, checkout (Stripe Checkout in test mode, or a labelled mock path), order history, and role-gated admin pages (book CRUD with cover upload, order management).

Requires Node.js 24 LTS (Docker images: node:24, nginx:1.30, mongo:8.0).

## Setup

1. `npm install` in the root, `Backend` and `Frontend`.
2. Copy `Backend/.env.example` to `Backend/.env` and set `PORT`, `MONGO_URI` and `JWT_SECRET` (required; the server exits at startup without it). Copy `Frontend/.env.example` to `Frontend/.env` (`VITE_API_URL`).
3. Start MongoDB, then run `npm start` in the root (runs backend and frontend together), or `npm run dev` in `Backend` and `Frontend` separately.

### Seed demo data
`npm run seed` in `Backend` (idempotent and deterministic, uses `MONGO_URI`; `--reset` also clears all orders first) adds 150 books across 10 genres
(cover image URLs), 20 users and 50 orders (totals match line items).
Demo logins (password `Password123!`, local demo data only): `admin@example.com` (role **admin**, set/promoted by the seed), `user@example.com`.
On first server start, if no admin exists and `ADMIN_PASSWORD` is set, `ADMIN_EMAIL` (default `admin@example.com`) is created as admin. Registration always creates role `user`.

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | - | `{name, email, password}` -> `{token, user}` |
| POST | `/api/auth/login` | - | `{email, password}` -> `{token, user}` |
| GET | `/api/auth/me` | Bearer | current user (+ `role`); 401 if the user no longer exists or the token was revoked |
| POST | `/api/auth/logout` | Bearer | bumps `tokenVersion`: every token issued so far stops working |
| GET | `/api/books` | - | `?search=&genre=&page=&limit=` -> `{books, page, limit, total, pages, genres}` |
| GET | `/api/books/:id` | - | one book |
| POST | `/api/books` | Admin | JSON or multipart (`title, author, genre, description, price, image` URL or `cover` file, JPEG/PNG/WebP/GIF <= 2MB) |
| PUT | `/api/books/:id` | Admin | partial update; same fields |
| DELETE | `/api/books/:id` | Admin | deletes book (and its uploaded cover) |
| POST | `/api/orders` | Bearer | MOCK order `{items:[{book, qty}]}`; prices computed server-side. Returns 403 when Stripe is configured |
| GET | `/api/payments/config` | - | `{mode: "stripe"|"mock"}` |
| POST | `/api/payments/checkout` | Bearer | `{items}` -> Stripe: `{mode:"stripe", url}` (redirect to Stripe Checkout); no Stripe key: `{mode:"mock", order}` |
| POST | `/api/payments/webhook` | Stripe signature | `checkout.session.completed` marks the order `paid (stripe)` |
| GET | `/api/admin/orders` | Admin | `?page=&limit=&status=` all orders with customer |
| PATCH | `/api/admin/orders/:id/status` | Admin | `{status: placed|processing|shipped|delivered|cancelled}` |
| GET | `/api/orders/mine` | Bearer | the user's orders |

Errors are JSON: `{ "error": "message" }`.

## Notes

- Sample books are seeded only when the `books` collection is empty.
- Payment: with no `STRIPE_SECRET_KEY` the **mock** path is used (order marked `paid (mock)`, UI says MOCK PAYMENT). With a Stripe **test** key, checkout redirects to Stripe Checkout and the webhook marks the order paid. Stripe integration is unit-tested with a mocked client only; the live Stripe flow has not been exercised.
- The cart is stored in browser localStorage; the JWT is stored in localStorage too (fine for a demo, not hardened).

## Payments (Stripe test mode)

Set in `Backend/.env`: `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`) and `FRONTEND_URL` (success/cancel redirects go to `$FRONTEND_URL/checkout/success` and `/checkout/cancel`). Forward webhooks locally with
`stripe listen --forward-to localhost:5000/api/payments/webhook` (it prints the `whsec_` value). Pay with test card 4242 4242 4242 4242.

## Tests

`npm test` in `Backend` (node:test + supertest). Needs local MongoDB; uses a throwaway database `bookStore_test` (override with `TEST_MONGO_URI`) that is dropped afterwards. Stripe is mocked.

## Deploy with Docker

```
export JWT_SECRET=$(openssl rand -hex 32)      # required
# optional: ADMIN_PASSWORD, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FRONTEND_URL, VITE_API_URL
docker compose up --build
```

Frontend (nginx) on http://localhost:8080, API on http://localhost:5000, MongoDB data in the `mongo-data` volume, uploaded covers in the `uploads` volume.
`VITE_API_URL` is baked into the frontend at build time, so set it to the public API URL before building for a real host, and set `FRONTEND_URL` to the public frontend URL.
To load demo data in the container: `INSTALL_DEV=true docker compose up --build -d` then `docker compose exec backend npm run seed` (the seed needs dev dependencies). In production, terminate TLS in front (reverse proxy / load balancer) and restrict CORS.
