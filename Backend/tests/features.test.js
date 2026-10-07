// Catalog, reviews, reading list, reorder, stock and dashboard tests. Uses a throwaway database that is dropped afterwards.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const TEST_URI = process.env.TEST_FEATURES_MONGO_URI || 'mongodb://127.0.0.1:27017/book_tmp_features';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstore-uploads-'));
delete process.env.STRIPE_SECRET_KEY;

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Book = require('../models/Book');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { loadCatalog } = require('../lib/catalog');

const api = () => request(app);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let adminToken, userToken, otherToken, a1, a2, b1, c1;

test.before(async () => {
	await mongoose.connect(TEST_URI);
	await mongoose.connection.dropDatabase();
	await User.create({ name: 'Admin', email: 'admin@example.com', password: 'secret123', role: 'admin' });
	adminToken = (await api().post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' })).body.token;
	userToken = (await api().post('/api/auth/register').send({ name: 'Una', email: 'una@example.com', password: 'secret123' })).body.token;
	otherToken = (await api().post('/api/auth/register').send({ name: 'Otto', email: 'otto@example.com', password: 'secret123' })).body.token;
	const day = 86400000;
	a1 = await Book.create({ title: 'Alpha', author: 'Ann Author', genre: 'Fantasy', language: 'English', price: 10, stock: 5, sold: 50, publishedAt: new Date(Date.now() - 30 * day) });
	a2 = await Book.create({ title: 'Beta', author: 'Ann Author', genre: 'Mystery', language: 'French', price: 20, stock: 0, sold: 10, rating: 4.5, numReviews: 2, publishedAt: new Date(Date.now() - 10 * day) });
	b1 = await Book.create({ title: 'Gamma', author: 'Bob Writer', genre: 'Fantasy', language: 'English', price: 30, stock: 3, sold: 99, rating: 3, numReviews: 1, publishedAt: new Date(Date.now() - 1 * day) });
	c1 = await Book.create({ title: 'Delta', author: 'Cy Penn', genre: 'Poetry', language: 'Spanish', price: 5, stock: 40, sold: 1, publishedAt: new Date(Date.now() - 90 * day) });
});

test.after(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
	fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

test('books list: filters, sorting and facets', async () => {
	const titles = (r) => r.body.books.map((b) => b.title);
	assert.deepEqual(titles(await api().get('/api/books?genre=Fantasy')), ['Alpha', 'Gamma']);
	assert.deepEqual(titles(await api().get('/api/books?language=French')), ['Beta']);
	assert.deepEqual(titles(await api().get('/api/books?minPrice=9&maxPrice=21')), ['Alpha', 'Beta']);
	assert.deepEqual(titles(await api().get('/api/books?minRating=4')), ['Beta']);
	assert.deepEqual(titles(await api().get('/api/books?author=Ann%20Author&inStock=1')), ['Alpha']);
	assert.deepEqual(titles(await api().get('/api/books?sort=price-desc')), ['Gamma', 'Beta', 'Alpha', 'Delta']);
	assert.deepEqual(titles(await api().get('/api/books?sort=newest&limit=2')), ['Gamma', 'Beta']);
	assert.deepEqual(titles(await api().get('/api/books?sort=bestselling&limit=1')), ['Gamma']);
	const res = await api().get('/api/books');
	assert.deepEqual(res.body.languages, ['English', 'French', 'Spanish']);
	assert.deepEqual(res.body.priceRange, { min: 5, max: 30 });
	assert.deepEqual(res.body.genres, ['Fantasy', 'Mystery', 'Poetry']);
	// regex characters in search are escaped, not interpreted
	assert.equal((await api().get('/api/books?search=.*')).body.total, 0);
});

test('featured and author endpoints', async () => {
	const f = await api().get('/api/books/featured');
	assert.equal(f.status, 200);
	assert.equal(f.body.bestsellers[0].title, 'Gamma');
	assert.ok(!f.body.bestsellers.some((b) => b.title === 'Beta'), 'out-of-stock books are not bestsellers');
	assert.equal(f.body.newArrivals[0].title, 'Gamma');
	assert.deepEqual(f.body.genres.find((g) => g.name === 'Fantasy'), { name: 'Fantasy', count: 2 });

	const a = await api().get('/api/books/author/ann%20author');
	assert.equal(a.status, 200);
	assert.equal(a.body.author, 'Ann Author');
	assert.equal(a.body.stats.count, 2);
	assert.deepEqual(a.body.stats.genres.sort(), ['Fantasy', 'Mystery']);
	assert.equal((await api().get('/api/books/author/nobody')).status, 404);
});

test('reviews: validation, one per user, rating aggregate, delete', async () => {
	const url = `/api/books/${c1._id}/reviews`;
	assert.equal((await api().post(url).send({ rating: 5 })).status, 401);
	assert.equal((await api().post(url).set(bearer(userToken)).send({ rating: 6 })).status, 400);
	assert.equal((await api().post(url).set(bearer(userToken)).send({ rating: 4.5 })).status, 400);
	assert.equal((await api().post(`/api/books/${new mongoose.Types.ObjectId()}/reviews`).set(bearer(userToken)).send({ rating: 5 })).status, 404);
	assert.equal((await api().post(url).set(bearer(userToken)).send({ rating: 5, text: 'Lovely' })).status, 201);
	assert.equal((await api().post(url).set(bearer(otherToken)).send({ rating: 2 })).status, 201);
	let r = await api().get(url);
	assert.equal(r.body.reviews.length, 2);
	assert.equal(r.body.numReviews, 2);
	assert.equal(r.body.rating, 3.5);
	// editing replaces the user's review instead of adding another
	await api().post(url).set(bearer(otherToken)).send({ rating: 4, text: 'Better on reread' });
	r = await api().get(url);
	assert.equal(r.body.reviews.length, 2);
	assert.equal(r.body.rating, 4.5);
	assert.equal((await api().delete(`${url}/mine`).set(bearer(otherToken))).status, 200);
	assert.equal((await api().delete(`${url}/mine`).set(bearer(otherToken))).status, 404);
	assert.equal((await api().get(url)).body.rating, 5);
	assert.equal((await Book.findById(c1._id)).numReviews, 1);
});

test('reading list: add, change status, validation, remove, per user', async () => {
	const h = bearer(userToken);
	assert.equal((await api().get('/api/me/reading-list')).status, 401);
	assert.deepEqual((await api().get('/api/me/reading-list').set(h)).body, []);
	assert.equal((await api().put(`/api/me/reading-list/${a1._id}`).set(h).send({ status: 'nope' })).status, 400);
	assert.equal((await api().put(`/api/me/reading-list/${new mongoose.Types.ObjectId()}`).set(h).send({ status: 'want' })).status, 404);
	let list = (await api().put(`/api/me/reading-list/${a1._id}`).set(h).send({ status: 'want' })).body;
	assert.equal(list.length, 1);
	assert.equal(list[0].book.title, 'Alpha');
	list = (await api().put(`/api/me/reading-list/${a1._id}`).set(h).send({ status: 'finished' })).body;
	assert.equal(list.length, 1);
	assert.equal(list[0].status, 'finished');
	await api().put(`/api/me/reading-list/${b1._id}`).set(h).send({});
	assert.equal((await api().get('/api/me/reading-list').set(h)).body.length, 2);
	assert.equal((await api().get('/api/me/reading-list').set(bearer(otherToken))).body.length, 0);
	list = (await api().delete(`/api/me/reading-list/${a1._id}`).set(h)).body;
	assert.deepEqual(list.map((e) => e.book.title), ['Gamma']);
});

test('orders: stock is enforced and decremented; shipping saved; reorder uses current data', async () => {
	const h = bearer(userToken);
	// only 3 of Gamma, 0 of Beta
	assert.equal((await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(b1._id), qty: 4 }] })).status, 409);
	assert.equal((await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(a2._id), qty: 1 }] })).status, 409);
	assert.equal((await Book.findById(b1._id)).stock, 3, 'rejected order must not change stock');

	const shipping = { name: 'Una', address: '1 Road', city: 'Town', postalCode: '12345', admin: 'x' };
	const res = await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(b1._id), qty: 2 }, { book: String(a1._id), qty: 1 }], shipping });
	assert.equal(res.status, 201);
	assert.equal(res.body.order.total, 70);
	assert.equal(res.body.order.shipping.city, 'Town');
	assert.equal(res.body.order.shipping.admin, undefined);
	const g = await Book.findById(b1._id);
	assert.equal(g.stock, 1);
	assert.equal(g.sold, 101);

	// price changes and a stock shortage are reflected on reorder
	await Book.updateOne({ _id: b1._id }, { price: 35 });
	await Book.updateOne({ _id: a1._id }, { stock: 0 });
	const id = res.body.order._id;
	assert.equal((await api().post(`/api/orders/${id}/reorder`).send({})).status, 401);
	assert.equal((await api().post(`/api/orders/${id}/reorder`).set(bearer(otherToken)).send({})).status, 404);
	assert.equal((await api().post('/api/orders/bad/reorder').set(h).send({})).status, 400);
	const re = await api().post(`/api/orders/${id}/reorder`).set(h).send({});
	assert.equal(re.status, 200);
	assert.equal(re.body.items.length, 1);
	assert.equal(re.body.items[0].price, 35);
	assert.equal(re.body.items[0].qty, 1, 'quantity is capped at remaining stock');
	assert.deepEqual(re.body.unavailable, ['Alpha']);
});

test('related books: co-purchased first, then same author/genre', async () => {
	await Book.updateOne({ _id: c1._id }, { stock: 40 });
	await Order.create({ user: new mongoose.Types.ObjectId(), items: [{ book: c1._id, title: 'Delta', price: 5, qty: 1 }, { book: b1._id, title: 'Gamma', price: 30, qty: 1 }], total: 35 });
	const r = await api().get(`/api/books/${c1._id}/related`);
	assert.equal(r.status, 200);
	assert.equal(r.body.books[0].title, 'Gamma');
	assert.ok(!r.body.books.some((b) => b.title === 'Delta'));
	const r2 = await api().get(`/api/books/${a2._id}/related`);
	assert.equal(r2.body.books[0].title, 'Alpha', 'same author fills in when nothing was bought together');
	assert.equal((await api().get(`/api/books/${new mongoose.Types.ObjectId()}/related`)).status, 404);
});

test('admin: new book fields validated; stats endpoint is admin-only and complete', async () => {
	const h = bearer(adminToken);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'a', price: 1, stock: -1 })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'a', price: 1, pages: 1.5 })).status, 400);
	const ok = await api().post('/api/books').set(h).send({ title: 'Eps', author: 'Eve', price: 3, stock: 7, pages: 120, language: 'German', excerpt: 'Once.' });
	assert.equal(ok.status, 201);
	assert.equal(ok.body.stock, 7);
	assert.equal(ok.body.language, 'German');
	assert.equal((await api().put(`/api/books/${ok.body._id}`).set(h).send({ stock: 0 })).body.stock, 0);

	assert.equal((await api().get('/api/admin/stats')).status, 401);
	assert.equal((await api().get('/api/admin/stats').set(bearer(userToken))).status, 403);
	const s = await api().get('/api/admin/stats?days=14').set(h);
	assert.equal(s.status, 200);
	assert.equal(s.body.salesByDay.length, 14);
	assert.equal(s.body.totals.orders, 2);
	assert.equal(s.body.totals.revenue, 105);
	assert.equal(s.body.salesByDay.at(-1).revenue, 105);
	assert.equal(s.body.statusCounts.placed, 2);
	assert.equal(s.body.topBooks[0].title, 'Gamma');
	assert.ok(s.body.lowStock.some((b) => b.title === 'Beta'));
	assert.ok(s.body.totals.lowStock >= 1);
	await Order.updateMany({}, { status: 'cancelled' });
	assert.equal((await api().get('/api/admin/stats').set(h)).body.totals.revenue, 0);
});

test('catalog loader seeds 40+ books with reviews and is idempotent', async () => {
	await Book.deleteMany({});
	await Review.deleteMany({});
	const first = await loadCatalog();
	assert.ok(first.books >= 40);
	assert.equal(await Book.countDocuments(), first.books);
	const second = await loadCatalog();
	assert.equal(await Book.countDocuments(), second.books);
	assert.equal(await Review.countDocuments(), second.reviews);
	const withReviews = await Book.find({ numReviews: { $gt: 0 } });
	assert.equal(withReviews.length, first.books);
	const genres = await Book.distinct('genre');
	assert.ok(genres.length >= 6);
});

test('coupons: pure rules, validation endpoint, redemption, admin CRUD', async () => {
	const { evalCoupon } = require('../lib/coupons');
	const base = { active: true, type: 'percent', value: 10, minSubtotal: 0, usageLimit: 0, used: 0 };
	assert.equal(evalCoupon(base, 50).discount, 5);
	assert.equal(evalCoupon({ ...base, type: 'fixed', value: 80 }, 50).discount, 50, 'never exceeds the subtotal');
	assert.equal(evalCoupon({ ...base, active: false }, 50).ok, false);
	assert.equal(evalCoupon({ ...base, expiresAt: new Date(Date.now() - 1000) }, 50).ok, false);
	assert.equal(evalCoupon({ ...base, usageLimit: 2, used: 2 }, 50).ok, false);
	assert.equal(evalCoupon({ ...base, minSubtotal: 60 }, 50).ok, false);

	assert.equal((await api().post('/api/admin/coupons').set(bearer(userToken)).send({ code: 'NOPE', type: 'percent', value: 5 })).status, 403);
	assert.equal((await api().post('/api/admin/coupons').set(bearer(adminToken)).send({ code: 'x', type: 'percent', value: 5 })).status, 400);
	assert.equal((await api().post('/api/admin/coupons').set(bearer(adminToken)).send({ code: 'BIG', type: 'percent', value: 150 })).status, 400);
	const made = await api().post('/api/admin/coupons').set(bearer(adminToken)).send({ code: 'save10', type: 'percent', value: 10, usageLimit: 1 });
	assert.equal(made.status, 201);
	assert.equal(made.body.code, 'SAVE10');
	assert.equal((await api().post('/api/admin/coupons').set(bearer(adminToken)).send({ code: 'SAVE10', type: 'fixed', value: 1 })).status, 409);

	const cb = await Book.create({ title: 'Coupon Book', author: 'Cy Penn', price: 5, stock: 40 });
	const items = [{ book: String(cb._id), qty: 2 }]; // 2 x 5 = 10
	const v = await api().post('/api/coupons/validate').set(bearer(userToken)).send({ code: 'save10', items });
	assert.equal(v.status, 200, JSON.stringify(v.body));
	assert.equal(v.body.discount, 1);
	assert.equal((await api().post('/api/coupons/validate').set(bearer(userToken)).send({ code: 'MISSING', items })).status, 400);

	const stockBefore = (await Book.findById(cb._id)).stock;
	const bad = await api().post('/api/payments/checkout').set(bearer(userToken)).send({ items, couponCode: 'MISSING' });
	assert.equal(bad.status, 400);
	assert.equal((await Book.findById(cb._id)).stock, stockBefore, 'a rejected coupon does not take stock');

	const ok = await api().post('/api/payments/checkout').set(bearer(userToken)).send({ items, couponCode: 'SAVE10' });
	assert.equal(ok.status, 201);
	assert.equal(ok.body.order.subtotal, 10);
	assert.equal(ok.body.order.discount, 1);
	assert.equal(ok.body.order.total, 9);
	assert.equal(ok.body.order.couponCode, 'SAVE10');
	const again = await api().post('/api/payments/checkout').set(bearer(otherToken)).send({ items, couponCode: 'SAVE10' });
	assert.equal(again.status, 400, 'usage limit of 1 is enforced');
	assert.equal((await Book.findById(cb._id)).stock, stockBefore - 2, 'stock released when the coupon fails at redemption');

	const upd = await api().put(`/api/admin/coupons/${made.body._id}`).set(bearer(adminToken)).send({ active: false, usageLimit: 0 });
	assert.equal(upd.body.active, false);
	const list = await api().get('/api/admin/coupons').set(bearer(adminToken));
	assert.equal(list.body[0].used, 1);
	assert.equal((await api().delete(`/api/admin/coupons/${made.body._id}`).set(bearer(adminToken))).status, 200);
	assert.equal((await api().delete(`/api/admin/coupons/${made.body._id}`).set(bearer(adminToken))).status, 404);
});
