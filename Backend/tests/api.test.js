// Core API behaviour: auth, roles, catalogue management, covers, orders and payments (mock and mocked Stripe).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers');
const { api, bearer, mongoose, store, app } = H;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
let admin, staff, user, bookA;

test.before(async () => {
	await H.connect();
	await H.mkUser('admin@example.com', 'admin');
	await H.mkUser('staff@example.com', 'staff');
	admin = await H.tokenFor('admin@example.com');
	staff = await H.tokenFor('staff@example.com');
	user = await H.register('user@example.com');
	bookA = await H.mkBook({ title: 'Test Book A', author: 'Author A', price: 10.5, image: 'http://x.test/a.jpg' });
});
test.after(H.cleanup);

test('auth: register always creates a customer, even if a role is sent', async () => {
	const r = await H.register('eve@example.com', 'Eve');
	assert.equal(r.res.status, 201);
	const res = await api().post('/api/auth/register').send({ name: 'Mallory', email: 'mal@example.com', password: 'secret123', role: 'admin' });
	assert.equal(res.body.user.role, 'user');
	assert.equal((await store.one('users', { email: 'mal@example.com' })).role, 'user');
	assert.equal((await store.one('users', { email: 'mal@example.com' })).password.startsWith('$2'), true, 'password is hashed');
});

test('auth: validation, duplicate email, bad login, no password leak', async () => {
	assert.equal((await api().post('/api/auth/register').send({ name: 'x', email: 'bad', password: 'secret123' })).status, 400);
	assert.equal((await api().post('/api/auth/register').send({ name: 'x', email: 'a@b.co', password: '123' })).status, 400);
	assert.equal((await H.register('user@example.com')).res.status, 409);
	assert.equal((await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'wrong' })).status, 401);
	const me = await api().get('/api/auth/me').set(user.h);
	assert.equal(me.status, 200);
	assert.equal(me.body.user.password, undefined);
	assert.equal(me.body.user.role, 'user');
	assert.equal((await api().get('/api/auth/me')).status, 401);
	assert.equal((await api().get('/api/auth/me').set(bearer('garbage'))).status, 401);
});

test('auth: token of a deleted user is rejected; logout revokes every token', async () => {
	const g = await H.register('ghost@example.com');
	await store.removeWhere('users', { email: 'ghost@example.com' });
	const res = await api().get('/api/auth/me').set(g.h);
	assert.equal(res.status, 401);
	assert.match(res.body.error, /no longer exists/);

	const r = await H.register('rev@example.com');
	assert.equal((await api().get('/api/auth/me').set(r.h)).status, 200);
	assert.equal((await api().post('/api/auth/logout').set(r.h)).status, 200);
	assert.equal((await store.one('users', { email: 'rev@example.com' })).tokenVersion, 1);
	const after = await api().get('/api/auth/me').set(r.h);
	assert.equal(after.status, 401);
	assert.match(after.body.error, /revoked/);
	const login = await H.login('rev@example.com', 'secret123');
	assert.equal((await api().get('/api/auth/me').set(login.h)).status, 200);
});

test('auth: disabled accounts cannot log in or use old tokens', async () => {
	const r = await H.register('banned@example.com');
	const u = await store.one('users', { email: 'banned@example.com' });
	const out = await api().patch(`/api/admin/users/${u._id}`).set(admin.h).send({ disabled: true });
	assert.equal(out.status, 200);
	assert.equal((await api().get('/api/auth/me').set(r.h)).status, 401);
	assert.equal((await api().post('/api/auth/login').send({ email: 'banned@example.com', password: 'secret123' })).status, 403);
});

test('roles: anonymous 401, customer 403, staff allowed on inventory, admin-only areas stay admin-only', async () => {
	const body = { title: 'New', author: 'Me', price: 5 };
	assert.equal((await api().post('/api/books').send(body)).status, 401);
	assert.equal((await api().post('/api/books').set(user.h).send(body)).status, 403);
	assert.equal((await api().put(`/api/books/${bookA._id}`).set(user.h).send(body)).status, 403);
	assert.equal((await api().delete(`/api/books/${bookA._id}`).set(user.h)).status, 403);
	assert.equal((await api().get('/api/admin/orders').set(user.h)).status, 403);
	assert.equal((await api().get('/api/admin/orders')).status, 401);
	assert.equal((await api().get('/api/admin/orders').set(admin.h)).status, 200);
	// staff: orders and catalogue yes; users, settings, coupons, reports, deleting books no
	assert.equal((await api().get('/api/admin/orders').set(staff.h)).status, 200);
	assert.equal((await api().get('/api/staff/overview').set(staff.h)).status, 200);
	for (const p of ['/api/admin/users', '/api/admin/settings', '/api/admin/coupons', '/api/admin/reports', '/api/admin/stats', '/api/admin/giftcards']) assert.equal((await api().get(p).set(staff.h)).status, 403, p);
	assert.equal((await api().delete(`/api/books/${bookA._id}`).set(staff.h)).status, 403);
	assert.equal((await api().get('/api/export/users.csv').set(staff.h)).status, 403);
	assert.equal((await api().get('/api/staff/overview').set(user.h)).status, 403);
});

test('books: public list, detail, search with typos and id validation', async () => {
	const list = await api().get('/api/books?search=test%20book');
	assert.equal(list.status, 200);
	assert.equal(list.body.books.length, 1);
	assert.equal((await api().get('/api/books?search=tset%20book')).body.books.length, 1, 'typo tolerant');
	assert.equal((await api().get(`/api/books/${bookA._id}`)).body.title, 'Test Book A');
	assert.equal((await api().get('/api/books/not-an-id!')).status, 400);
	assert.equal((await api().get(`/api/books/${new mongoose.Types.ObjectId()}`)).status, 404);
});

test('books: create/update/delete with validation, formats and ISBN rules', async () => {
	const h = staff.h;
	assert.equal((await api().post('/api/books').set(h).send({ author: 'x', price: 1 })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: -1 })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: 'abc' })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: 1, image: 'javascript:alert(1)' })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 't', author: 'x', price: 1, isbn: '123' })).status, 400);
	const created = await api().post('/api/books').set(h).send({ title: 'Created', author: 'Zed', genre: 'Tech', price: 12.345, image: 'https://img.test/c.png' });
	assert.equal(created.status, 201);
	assert.equal(created.body.price, 12.35);
	assert.equal(created.body.formats[0].type, 'paperback');
	assert.equal(created.body.stock, 50);
	const id = created.body._id;
	const upd = await api().put(`/api/books/${id}`).set(h).send({ price: 20 });
	assert.equal(upd.status, 200);
	assert.equal(upd.body.price, 20);
	assert.equal(upd.body.title, 'Created');
	assert.equal((await api().put(`/api/books/${id}`).set(h).send({ price: -5 })).status, 400);
	assert.equal((await api().put(`/api/books/${new mongoose.Types.ObjectId()}`).set(h).send({ price: 5 })).status, 404);

	const multi = await api().put(`/api/books/${id}`).set(h).send({ formats: [{ type: 'paperback', price: 9.99, stock: 3, isbn: '9780306406157' }, { type: 'ebook', price: 4.99 }, { type: 'audiobook', price: 12, minutes: 300 }] });
	assert.equal(multi.status, 200);
	assert.deepEqual(multi.body.formats.map((f) => f.type), ['paperback', 'ebook', 'audiobook']);
	assert.equal(multi.body.stock, 3);
	assert.equal(multi.body.formats[1].stock, undefined, 'digital formats have no stock');
	assert.equal((await api().put(`/api/books/${id}`).set(h).send({ formats: [{ type: 'paperback', price: 9 }, { type: 'paperback', price: 8 }] })).status, 400);
	assert.equal((await api().put(`/api/books/${id}`).set(h).send({ formats: [{ type: 'vinyl', price: 9 }] })).status, 400);
	assert.equal((await api().post('/api/books').set(h).send({ title: 'Dup', author: 'x', price: 1, isbn: '9780306406157' })).status, 409, 'ISBN must be unique');
	assert.equal((await api().delete(`/api/books/${id}`).set(admin.h)).status, 200);
	assert.equal((await api().delete(`/api/books/${id}`).set(admin.h)).status, 404);
	assert.equal((await api().get(`/api/books/${id}`)).status, 404);
});

test('books: cover upload validation, storage, serving and cleanup', async () => {
	const h = staff.h;
	const ok = await api().post('/api/books').set(h).field('title', 'With Cover').field('author', 'Up Loader').field('price', '9.99').attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' });
	assert.equal(ok.status, 201);
	assert.match(ok.body.image, /^\/uploads\/[0-9a-f]{32}\.png$/);
	const file = path.join(process.env.UPLOAD_DIR, path.basename(ok.body.image));
	assert.ok(fs.existsSync(file));
	assert.equal((await api().get(ok.body.image)).status, 200);
	// anonymous callers never get a file stored
	const before0 = fs.readdirSync(process.env.UPLOAD_DIR).length;
	assert.equal((await api().post('/api/books').field('title', 't').field('author', 'a').field('price', '1').attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' })).status, 401);
	assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, before0);
	// multipart formats as JSON text
	const mp = await api().post('/api/books').set(h).field('title', 'Multi').field('author', 'a').field('formats', JSON.stringify([{ type: 'hardcover', price: 20, stock: 2 }])).attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' });
	assert.equal(mp.status, 201);
	assert.equal(mp.body.formats[0].type, 'hardcover');
	// wrong mime, lying content, too large
	assert.equal((await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1').attach('cover', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })).status, 400);
	const fake = await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1').attach('cover', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
	assert.equal(fake.status, 400);
	assert.match(fake.body.error, /not a valid image/);
	assert.equal((await api().post('/api/books').set(h).field('title', 't').field('author', 'a').field('price', '1').attach('cover', Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' })).status, 400);
	// invalid fields remove the uploaded file
	const before = fs.readdirSync(process.env.UPLOAD_DIR).length;
	assert.equal((await api().post('/api/books').set(h).field('title', 'no price').field('author', 'a').attach('cover', PNG, { filename: 'c.png', contentType: 'image/png' })).status, 400);
	assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, before);
	// replacing the cover removes the old file; deleting the book removes the new one
	const upd = await api().put(`/api/books/${ok.body._id}`).set(h).attach('cover', PNG, { filename: 'n.png', contentType: 'image/png' });
	assert.equal(upd.status, 200);
	await new Promise((r) => setTimeout(r, 100));
	assert.ok(!fs.existsSync(file));
	const count = fs.readdirSync(process.env.UPLOAD_DIR).length;
	assert.equal((await api().delete(`/api/books/${ok.body._id}`).set(admin.h)).status, 200);
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, count - 1);
});

test('orders (mock path): server-side pricing, shipping and tax, validation, listing', async () => {
	const h = user.h;
	assert.equal((await api().post('/api/orders').send({ items: [] })).status, 401);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [] })).status, 400);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: 'x', qty: 1 }] })).status, 400);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 0 }] })).status, 400);
	assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: String(new mongoose.Types.ObjectId()), qty: 1 }] })).status, 400);
	// client-sent price is ignored: 2 x 10.50 = 21.00 + standard shipping 4.99 + 7% tax on 21.00
	const res = await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 2, price: 0.01 }] });
	assert.equal(res.status, 201);
	assert.equal(res.body.subtotal, 21);
	assert.equal(res.body.shippingCost, 4.99);
	assert.equal(res.body.tax, 1.47);
	assert.equal(res.body.total, 27.46);
	assert.equal(res.body.paymentStatus, 'paid (mock)');
	assert.equal(res.body.pointsEarned, 21);
	assert.equal((await store.get('books', bookA._id)).stock, 48);
	const mine = await api().get('/api/orders/mine').set(h);
	assert.equal(mine.body.length, 1);
	assert.equal((await api().get('/api/orders/mine').set(admin.h)).body.length, 0);
});

test('stock: cannot oversell and nothing is reserved on failure', async () => {
	const b = await H.mkBook({ title: 'Scarce', price: 5, stock: 2 });
	const over = await api().post('/api/orders').set(user.h).send({ items: [{ book: String(b._id), qty: 3 }] });
	assert.equal(over.status, 409);
	assert.match(over.body.error, /Only 2 copies/);
	assert.equal((await store.get('books', b._id)).stock, 2);
	const ok = await Promise.all([1, 2, 3].map(() => api().post('/api/orders').set(user.h).send({ items: [{ book: String(b._id), qty: 1 }] })));
	assert.equal(ok.filter((r) => r.status === 201).length, 2, 'exactly the stock can be sold under concurrency');
	assert.equal((await store.get('books', b._id)).stock, 0);
	assert.match((await api().post('/api/orders').set(user.h).send({ items: [{ book: String(b._id), qty: 1 }] })).body.error, /out of stock/);
});

test('admin orders: list with user, filter, status update, restock on cancel', async () => {
	const h = staff.h;
	const list = await api().get('/api/admin/orders').set(h);
	assert.ok(list.body.total >= 1);
	const row = list.body.orders.find((o) => o.user?.email === 'user@example.com');
	assert.ok(row);
	const id = row._id;
	assert.equal((await api().patch(`/api/admin/orders/${id}/status`).set(h).send({ status: 'bogus' })).status, 400);
	assert.equal((await api().patch(`/api/admin/orders/${new mongoose.Types.ObjectId()}/status`).set(h).send({ status: 'shipped' })).status, 404);
	assert.equal((await api().patch(`/api/admin/orders/${id}/status`).set(user.h).send({ status: 'shipped' })).status, 403);
	const ok = await api().patch(`/api/admin/orders/${id}/status`).set(h).send({ status: 'shipped' });
	assert.equal(ok.status, 200);
	assert.equal(ok.body.status, 'shipped');
	assert.ok((await api().get('/api/admin/orders?status=shipped').set(h)).body.total >= 1);
	assert.equal((await api().get('/api/admin/orders?q=nobody-here').set(h)).body.total, 0);
	// cancelling returns stock and cancelled orders cannot be reopened
	const b = await H.mkBook({ title: 'Cancelled Stock', price: 5, stock: 5 });
	const o = await api().post('/api/orders').set(user.h).send({ items: [{ book: String(b._id), qty: 2 }] });
	assert.equal((await store.get('books', b._id)).stock, 3);
	assert.equal((await api().patch(`/api/admin/orders/${o.body._id}/status`).set(h).send({ status: 'cancelled' })).status, 200);
	assert.equal((await store.get('books', b._id)).stock, 5);
	assert.equal((await api().patch(`/api/admin/orders/${o.body._id}/status`).set(h).send({ status: 'placed' })).status, 409);
});

test('payments: mock mode when STRIPE_SECRET_KEY is absent', async () => {
	assert.equal((await api().get('/api/payments/config')).body.mode, 'mock');
	const res = await api().post('/api/payments/checkout').set(user.h).send({ items: [{ book: String(bookA._id), qty: 1 }] });
	assert.equal(res.status, 201);
	assert.equal(res.body.mode, 'mock');
	assert.equal(res.body.order.paymentStatus, 'paid (mock)');
	assert.equal((await api().post('/api/payments/checkout').send({ items: [] })).status, 401);
	assert.equal((await api().post('/api/payments/webhook').send({})).status, 503);
});

// ---- Stripe path with a MOCKED client (no network, no real Stripe account) ----
test('payments: Stripe session from server prices (shipping, tax, discounts); webhook marks paid once; expiry restores everything', async () => {
	const Stripe = require('stripe');
	const real = new Stripe('sk_test_dummy_not_real'); // only used offline for signature helpers
	const sign = (payload) => real.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
	const calls = [];
	const fake = {
		checkout: { sessions: { create: async (params) => (calls.push(params), { id: 'cs_test_123', url: 'https://checkout.stripe.test/pay/cs_test_123' }) } },
		coupons: { create: async () => ({ id: 'co_1' }) },
		webhooks: real.webhooks,
	};
	app.set('stripe', fake);
	try {
		assert.equal((await api().get('/api/payments/config')).body.mode, 'stripe');
		const h = user.h;
		assert.equal((await api().post('/api/orders').set(h).send({ items: [{ book: String(bookA._id), qty: 1 }] })).status, 403, 'mock orders disabled so payment cannot be bypassed');

		const stock0 = (await store.get('books', bookA._id)).stock;
		const pts0 = (await store.get('users', user.user.id)).lifetimePoints;
		const res = await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 2, price: 0.01 }], shipping: { name: 'A', address: '1 Road', city: 'T', postalCode: '1000' } });
		assert.equal(res.status, 201);
		assert.equal(res.body.mode, 'stripe');
		assert.equal(res.body.url, 'https://checkout.stripe.test/pay/cs_test_123');
		const p = calls[0];
		assert.equal(p.mode, 'payment');
		assert.equal(p.line_items[0].price_data.unit_amount, 1050); // server price 10.5, not the client's 0.01
		assert.equal(p.line_items[0].quantity, 2);
		assert.deepEqual(p.line_items.slice(1).map((l) => [l.price_data.product_data.name, l.price_data.unit_amount]), [['Shipping', 499], ['Estimated tax', 147]]);
		assert.equal(p.metadata.orderId, res.body.orderId);
		assert.ok(p.success_url.startsWith('http://frontend.test/checkout/success'));
		assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
		assert.ok(p.cancel_url.startsWith('http://frontend.test/checkout/cancel'));
		const order = await store.get('orders', res.body.orderId);
		assert.equal(order.paymentStatus, 'pending (stripe)');
		assert.equal(order.stripeSessionId, 'cs_test_123');
		assert.equal(order.total, 27.46);
		assert.equal((await store.get('books', bookA._id)).stock, stock0 - 2);
		assert.equal((await store.get('users', order.user)).lifetimePoints, pts0, 'points are only awarded once the order is paid');

		const event = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_123', payment_status: 'paid', metadata: { orderId: res.body.orderId } } } });
		const post = (payload, sig) => { const r = api().post('/api/payments/webhook').set('Content-Type', 'application/json'); return (sig ? r.set('Stripe-Signature', sig) : r).send(payload); };
		assert.equal((await post(event, 't=1,v1=bad')).status, 400);
		assert.equal((await post(event)).status, 400);
		assert.equal((await store.get('orders', res.body.orderId)).paymentStatus, 'pending (stripe)');
		assert.equal((await post(event, sign(event))).status, 200);
		assert.equal((await store.get('orders', res.body.orderId)).paymentStatus, 'paid (stripe)');
		const pts = (await store.get('users', order.user)).lifetimePoints;
		assert.equal(pts, pts0 + 21);
		assert.equal((await post(event, sign(event))).status, 200);
		assert.equal((await store.get('users', order.user)).lifetimePoints, pts, 'a replayed webhook awards points once');

		// an expired session cancels the pending order and restores stock
		const stock = (await store.get('books', bookA._id)).stock;
		const r2 = await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 2 }] });
		assert.equal((await store.get('books', bookA._id)).stock, stock - 2);
		const exp = JSON.stringify({ id: 'evt_2', object: 'event', type: 'checkout.session.expired', data: { object: { id: 'cs_x', metadata: { orderId: r2.body.orderId } } } });
		assert.equal((await post(exp, sign(exp))).status, 200);
		assert.equal((await store.get('orders', r2.body.orderId)).status, 'cancelled');
		assert.equal((await store.get('books', bookA._id)).stock, stock);

		// Stripe API failure leaves no orphan order and no reserved stock
		const count = await store.count('orders');
		fake.checkout.sessions.create = async () => {
			throw new Error('stripe down');
		};
		assert.equal((await api().post('/api/payments/checkout').set(h).send({ items: [{ book: String(bookA._id), qty: 1 }] })).status, 500);
		assert.equal(await store.count('orders'), count);
		assert.equal((await store.get('books', bookA._id)).stock, stock);
	} finally {
		app.set('stripe', undefined);
	}
});

test('unknown API route returns JSON 404; bad JSON is a 400', async () => {
	const res = await api().get('/api/nope');
	assert.equal(res.status, 404);
	assert.equal(res.body.error, 'Not found');
	assert.equal((await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{oops')).status, 400);
});
