// Run with `npm test`. Uses a throwaway database (bookStore_test on local MongoDB) that is dropped afterwards.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const TEST_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/bookStore_test';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstore-uploads-'));
process.env.FRONTEND_URL = 'http://frontend.test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
delete process.env.STRIPE_SECRET_KEY; // never hit real Stripe; start on the mock path

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Book = require('../models/Book');
const Order = require('../models/Order');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const api = () => request(app);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

let adminToken, userToken, userId, bookA;

async function register(email, name = 'Tester') {
	const res = await api().post('/api/auth/register').send({ name, email, password: 'secret123' });
	return res;
}

test.before(async () => {
	await mongoose.connect(TEST_URI);
	await mongoose.connection.dropDatabase();
	await User.create({ name: 'Admin', email: 'admin@example.com', password: 'secret123', role: 'admin' });
	adminToken = (await api().post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' })).body.token;
	const u = await register('user@example.com');
	userToken = u.body.token;
	userId = u.body.user.id;
	bookA = await Book.create({ title: 'Test Book A', author: 'Author A', genre: 'Fiction', price: 10.5, image: 'http://x.test/a.jpg' });
});

test.after(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
	fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

test('auth: register always creates role user, even if role is sent', async () => {
	const res = await api().post('/api/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'secret123', role: 'admin' });
	assert.equal(res.status, 201);
	assert.equal(res.body.user.role, 'user');
	assert.equal((await User.findOne({ email: 'eve@example.com' })).role, 'user');
});

test('auth: validation, duplicate email, bad login', async () => {
	assert.equal((await api().post('/api/auth/register').send({ name: 'x', email: 'bad', password: 'secret123' })).status, 400);
	assert.equal((await api().post('/api/auth/register').send({ name: 'x', email: 'a@b.co', password: '123' })).status, 400);
	assert.equal((await register('user@example.com')).status, 409);
	assert.equal((await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'wrong' })).status, 401);
});

test('auth: /me returns the user and role; missing/garbage token is 401', async () => {
	const me = await api().get('/api/auth/me').set(bearer(adminToken));
	assert.equal(me.status, 200);
	assert.equal(me.body.user.role, 'admin');
	assert.equal((await api().get('/api/auth/me')).status, 401);
	assert.equal((await api().get('/api/auth/me').set(bearer('garbage'))).status, 401);
});

test('auth: token of a deleted user is rejected', async () => {
	const r = await register('ghost@example.com');
	await User.deleteOne({ email: 'ghost@example.com' });
	const res = await api().get('/api/auth/me').set(bearer(r.body.token));
	assert.equal(res.status, 401);
	assert.match(res.body.error, /no longer exists/);
});

test('revocation: logout bumps tokenVersion and stale tokens are rejected; new login works', async () => {
	const r = await register('rev@example.com');
	const old = r.body.token;
	assert.equal((await api().get('/api/auth/me').set(bearer(old))).status, 200);
	const out = await api().post('/api/auth/logout').set(bearer(old));
	assert.equal(out.status, 200);
	assert.equal((await User.findOne({ email: 'rev@example.com' })).tokenVersion, 1);
	const after = await api().get('/api/auth/me').set(bearer(old));
	assert.equal(after.status, 401);
	assert.match(after.body.error, /revoked/);
	assert.equal((await api().post('/api/auth/logout').set(bearer(old))).status, 401);
	const login = await api().post('/api/auth/login').send({ email: 'rev@example.com', password: 'secret123' });
	assert.equal((await api().get('/api/auth/me').set(bearer(login.body.token))).status, 200);
	assert.equal((await api().post('/api/auth/logout')).status, 401);
});

test('roles: anonymous 401, normal user 403, admin allowed on admin endpoints', async () => {
	const body = { title: 'New', author: 'Me', price: 5 };
	assert.equal((await api().post('/api/books').send(body)).status, 401);
	assert.equal((await api().post('/api/books').set(bearer(userToken)).send(body)).status, 403);
	assert.equal((await api().put(`/api/books/${bookA._id}`).set(bearer(userToken)).send(body)).status, 403);
	assert.equal((await api().delete(`/api/books/${bookA._id}`).set(bearer(userToken))).status, 403);
	assert.equal((await api().get('/api/admin/orders').set(bearer(userToken))).status, 403);
	assert.equal((await api().get('/api/admin/orders')).status, 401);
	assert.equal((await api().get('/api/admin/orders').set(bearer(adminToken))).status, 200);
});

test('books: public list/detail/search/genre', async () => {
	const list = await api().get('/api/books?search=test%20book');
	assert.equal(list.status, 200);
	assert.equal(list.body.books.length, 1);
	assert.equal((await api().get(`/api/books/${bookA._id}`)).body.title, 'Test Book A');
	assert.equal((await api().get('/api/books/not-an-id')).status, 400);
	assert.equal((await api().get(`/api/books/${new mongoose.Types.ObjectId()}`)).status, 404);
});

test('books: admin create/update/delete with validation (JSON + URL)', async () => {
	const h = bearer(adminToken);
	assert.equal((await api().post('/api/books').set(h).send({ author: 'x', price: 1 })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: -1 })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: 'abc' })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: 1, image: 'javascript:alert(1)' })).status, 400);
	const created = await api().post('/api/books').set(h).send({ title: 'Created', author: 'Zed', genre: 'Tech', price: 12.345, image: 'https://img.test/c.png' });
	assert.equal(created.status, 201);
	assert.equal(created.body.price, 12.35);
	const id = created.body._id;
	const upd = await api().put(`/api/books/${id}`).set(h).send({ price: 20 });
	assert.equal(upd.status, 200);
	assert.equal(upd.body.price, 20);
	assert.equal(upd.body.title, 'Created');
	assert.equal((await api().put(`/api/books/${id}`).set(h).send({ price: -5 })).status, 400);
	assert.equal((await api().put(`/api/books/${new mongoose.Types.ObjectId()}`).set(h).send({ price: 5 })).status, 404);
	assert.equal((await api().delete(`/api/books/${id}`).set(h)).status, 200);
	assert.equal((await api().delete(`/api/books/${id}`).set(h)).status, 404);
	assert.equal((await api().get(`/api/books/${id}`)).status, 404);
});

test('books: cover upload validation, storage, serving and cleanup', async () => {
	const h = bearer(adminToken);
	const ok = await api().post('/api/books').set(h).field('title', 'With Cover').field('author', 'Up Loader').field('price', '9.99')
		.attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' });
	assert.equal(ok.status, 201);
	assert.match(ok.body.image, /^\/uploads\/[0-9a-f]{32}\.png$/);
	const file = path.join(process.env.UPLOAD_DIR, path.basename(ok.body.image));
	assert.ok(fs.existsSync(file));
	assert.equal((await api().get(ok.body.image)).status, 200);

	// wrong mime
	const txt = await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1')
		.attach('cover', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
	assert.equal(txt.status, 400);
	// lying content-type (not really an image)
	const fake = await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1')
		.attach('cover', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
	assert.equal(fake.status, 400);
	assert.match(fake.body.error, /not a valid image/);
	// too large
	const big = await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1')
		.attach('cover', Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' });
	assert.equal(big.status, 400);
	// invalid fields remove the uploaded file
	const before = fs.readdirSync(process.env.UPLOAD_DIR).length;
	const bad = await api().post('/api/books').set(h).field('title', 'no price').field('author', 'a')
		.attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' });
	assert.equal(bad.status, 400);
	assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, before);

	// replacing the cover removes the old file; deleting the book removes the new one
	const upd = await api().put(`/api/books/${ok.body._id}`).set(h).attach('cover', PNG, { filename: 'n.png', contentType: 'image/png' });
	assert.equal(upd.status, 200);
	await new Promise((r) => setTimeout(r, 100));
	assert.ok(!fs.existsSync(file));
	assert.equal((await api().delete(`/api/books/${ok.body._id}`).set(h)).status, 200);
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, before - 1);
});

test('orders (mock path): server-side pricing, validation, listing', async () => {
	const h = bearer(userToken);
	assert.equal((await api().post('/api/orders').send({ items: [] })).status, 401);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [] })).status, 400);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: 'x', qty: 1 }] })).status, 400);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 0 }] })).status, 400);
	// client-sent price is ignored
	const res = await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 2, price: 0.01 }] });
	assert.equal(res.status, 201);
	assert.equal(res.body.total, 21);
	assert.equal(res.body.paymentStatus, 'paid (mock)');
	const mine = await api().get('/api/orders/mine').set(h);
	assert.equal(mine.body.length, 1);
	assert.equal((await api().get('/api/orders/mine').set(bearer(adminToken))).body.length, 0);
});

test('admin orders: list with user, filter, status update and validation', async () => {
	const h = bearer(adminToken);
	const list = await api().get('/api/admin/orders').set(h);
	assert.equal(list.body.total, 1);
	assert.equal(list.body.orders[0].user.email, 'user@example.com');
	const id = list.body.orders[0]._id;
	assert.equal((await api().patch(`/api/admin/orders/${id}/status`).set(h).send({ status: 'bogus' })).status, 400);
	assert.equal((await api().patch(`/api/admin/orders/${new mongoose.Types.ObjectId()}/status`).set(h).send({ status: 'shipped' })).status, 404);
	assert.equal((await api().patch(`/api/admin/orders/${id}/status`).set(bearer(userToken)).send({ status: 'shipped' })).status, 403);
	const ok = await api().patch(`/api/admin/orders/${id}/status`).set(h).send({ status: 'shipped' });
	assert.equal(ok.status, 200);
	assert.equal(ok.body.status, 'shipped');
	assert.equal((await api().get('/api/admin/orders?status=shipped').set(h)).body.total, 1);
	assert.equal((await api().get('/api/admin/orders?status=delivered').set(h)).body.total, 0);
});

test('payments: mock mode when STRIPE_SECRET_KEY is absent', async () => {
	assert.equal((await api().get('/api/payments/config')).body.mode, 'mock');
	const res = await api().post('/api/payments/checkout').set(bearer(userToken)).send({ items: [{ book: String(bookA._id), qty: 1 }] });
	assert.equal(res.status, 201);
	assert.equal(res.body.mode, 'mock');
	assert.equal(res.body.order.paymentStatus, 'paid (mock)');
	assert.equal((await api().post('/api/payments/checkout').send({ items: [] })).status, 401);
	assert.equal((await api().post('/api/payments/webhook').send({})).status, 503);
});

// ---- Stripe path with a MOCKED client (no network, no real Stripe account) ----
test('payments: Stripe checkout session built from server-side prices; webhook marks order paid', async () => {
	const Stripe = require('stripe');
	const real = new Stripe('sk_test_dummy_not_real'); // only used offline for signature helpers
	const calls = [];
	const fake = {
		checkout: {
			sessions: {
				create: async (params) => {
					calls.push(params);
					return { id: 'cs_test_123', url: 'https://checkout.stripe.test/pay/cs_test_123' };
				},
			},
		},
		webhooks: real.webhooks, // real signature verification
	};
	app.set('stripe', fake);
	try {
		assert.equal((await api().get('/api/payments/config')).body.mode, 'stripe');
		const h = bearer(userToken);
		// mock order path is disabled so payment cannot be bypassed
		assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 1 }] })).status, 403);

		const res = await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 3, price: 0.01 }] });
		assert.equal(res.status, 201);
		assert.equal(res.body.mode, 'stripe');
		assert.equal(res.body.url, 'https://checkout.stripe.test/pay/cs_test_123');
		const p = calls[0];
		assert.equal(p.mode, 'payment');
		assert.equal(p.line_items[0].price_data.unit_amount, 1050); // server price 10.5, not client's 0.01
		assert.equal(p.line_items[0].quantity, 3);
		assert.equal(p.metadata.orderId, res.body.orderId);
		assert.ok(p.success_url.startsWith('http://frontend.test/checkout/success'));
		assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
		assert.ok(p.cancel_url.startsWith('http://frontend.test/checkout/cancel'));
		let order = await Order.findById(res.body.orderId);
		assert.equal(order.paymentStatus, 'pending (stripe)');
		assert.equal(order.stripeSessionId, 'cs_test_123');
		assert.equal(order.total, 31.5);

		const event = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_123', payment_status: 'paid', metadata: { orderId: res.body.orderId } } } });
		const sign = (payload, secret) => real.webhooks.generateTestHeaderString({ payload, secret });
		// bad / missing signature
		assert.equal((await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', 't=1,v1=bad').send(event)).status, 400);
		assert.equal((await api().post('/api/payments/webhook').set('Content-Type', 'application/json').send(event)).status, 400);
		assert.equal((await Order.findById(res.body.orderId)).paymentStatus, 'pending (stripe)');
		// valid signature
		const ok = await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', sign(event, 'whsec_test_secret')).send(event);
		assert.equal(ok.status, 200);
		order = await Order.findById(res.body.orderId);
		assert.equal(order.paymentStatus, 'paid (stripe)');
		// replay is idempotent
		assert.equal((await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', sign(event, 'whsec_test_secret')).send(event)).status, 200);

		// expired session cancels a pending order
		const r2 = await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 1 }] });
		const exp = JSON.stringify({ id: 'evt_2', object: 'event', type: 'checkout.session.expired', data: { object: { id: 'cs_x', metadata: { orderId: r2.body.orderId } } } });
		await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', sign(exp, 'whsec_test_secret')).send(exp);
		const o2 = await Order.findById(r2.body.orderId);
		assert.equal(o2.status, 'cancelled');

		// Stripe API failure leaves no orphan order
		const count = await Order.countDocuments();
		fake.checkout.sessions.create = async () => {
			throw new Error('stripe down');
		};
		assert.equal((await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 1 }] })).status, 500);
		assert.equal(await Order.countDocuments(), count);
	} finally {
		app.set('stripe', undefined);
	}
});

test('unknown API route returns JSON 404; user id sanity', async () => {
	const res = await api().get('/api/nope');
	assert.equal(res.status, 404);
	assert.ok(userId);
});
