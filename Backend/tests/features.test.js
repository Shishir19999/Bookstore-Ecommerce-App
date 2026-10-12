// Feature behaviour on the full sample data set: formats, pricing rules, gift cards, loyalty, pre-orders, returns, reviews,
// Q&A, reader, library, goals, clubs (with realtime), authors, events, ISBN import, moderation and admin tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const { api, store, app, mongoose } = H;

let reader, staff, admin, other;
const book = (title) => store.one('books', { title });
const id = async (title) => String((await book(title))._id);
const ship = { name: 'Dee', address: '12 Quill Lane', city: 'Bookford', postalCode: '10001' };

test.before(async () => {
	await H.connect();
	await H.seed();
	reader = await H.login('user@example.com');
	staff = await H.login('staff@example.com');
	admin = await H.login('admin@example.com');
	other = await H.login('amelia.hart@example.com');
});
test.after(H.cleanup);

test('sample data: books with formats, series, bundles, collections, pre-orders and classics', async () => {
	const feat = (await api().get('/api/books/featured')).body;
	assert.equal(feat.bestsellers.length, 8);
	assert.equal(feat.comingSoon.length, 4);
	assert.ok(feat.collections.length >= 3 && feat.bundles.length === 3 && feat.events.length === 3);
	const all = (await api().get('/api/books?limit=50&sort=title')).body;
	assert.equal(all.total, 74);
	assert.deepEqual(all.formats, ['paperback', 'hardcover', 'ebook', 'audiobook']);
	const austen = (await api().get('/api/books?author=Jane%20Austen')).body.books[0];
	assert.equal(austen.formats.find((f) => f.type === 'ebook').price, 1.99);
	assert.equal((await api().get('/api/books?preorder=1')).body.total, 4);
	assert.equal((await api().get('/api/books?format=audiobook&limit=50')).body.books.every((b) => b.formats.some((f) => f.type === 'audiobook')), true);
	const series = (await api().get('/api/series/the-ashen-kingdoms')).body;
	assert.deepEqual(series.books.map((b) => b.series.number), [1, 2, 3, 4]);
	assert.equal(series.books[3].upcoming, true);
	const bundle = (await api().get('/api/bundles/classic-starter-pack')).body;
	assert.equal(bundle.books.length, 3);
	assert.equal(bundle.price, Math.round(bundle.listPrice * 0.8 * 100) / 100);
	assert.ok((await api().get('/api/collections/quiet-classics')).body.books.length === 6);
});

test('search: typo tolerance, autocomplete, ISBN and did-you-mean', async () => {
	const t = async (q) => (await api().get(`/api/books?search=${encodeURIComponent(q)}`)).body;
	assert.equal((await t('lantrn orrin')).books[0].title, 'The Lantern of Orrin Vale');
	assert.equal((await t('harriet lowel')).books[0].author, 'Harriet Lowell');
	assert.equal((await t('prde and prejudice')).books[0].title, 'Pride and Prejudice');
	assert.equal((await t('zzzzqq')).total, 0);
	const isbn = (await book('Ember Court')).formats[0].isbn;
	assert.equal((await t(isbn)).books[0].title, 'Ember Court');
	const s = (await api().get('/api/books/suggest?q=jane%20aus')).body;
	assert.equal(s.books[0].author, 'Jane Austen');
	assert.deepEqual(s.authors, ['Jane Austen']);
	assert.equal((await api().get('/api/books/suggest?q=tidewter')).body.didYouMean, 'tidewater');
	assert.equal((await t('crwn of salt and thron')).books[0].title, 'Crown of Salt and Thorn');
	assert.equal((await t('qxzvbn')).didYouMean, null);
	const dym = (await t('lanturn xyz')).didYouMean;
	assert.ok(dym === null || /lantern/.test(dym));
});

test('checkout rules: tax by country and format, shipping, free shipping, express, bundles, coupons', async () => {
	const quote = (body) => api().post('/api/checkout/quote').set(reader.h).send(body);
	const cheap = await id('Salt, Ink, Ash'); // paperback 8.99
	const ember = await id('Ember Court'); // paperback 21.99
	const a = (await quote({ items: [{ book: cheap, qty: 1 }], shipping: { country: 'US' } })).body.totals;
	assert.equal(a.goods, 8.99);
	assert.equal(a.shipping, 4.99);
	assert.equal(a.tax, 0.63);
	assert.equal(a.total, 14.61);
	assert.equal(a.pointsEarned, Math.floor(8.99 * 1.25), 'silver earns 25% bonus points');
	// over $35 of physical books ships free
	const free = (await quote({ items: [{ book: ember, qty: 2 }] })).body.totals;
	assert.equal(free.shipping, 0);
	assert.equal(free.shippingFree, true);
	// express and international surcharge, UK has no tax on printed books but taxes e-books at 20%
	const exp = (await quote({ items: [{ book: cheap, qty: 1 }], method: 'express', shipping: { country: 'GB' } })).body.totals;
	assert.equal(exp.shipping, 19.99);
	assert.equal(exp.tax, 0);
	const pride = await id('The Hidden Life of Tide Pools');
	const digital = (await quote({ items: [{ book: pride, format: 'ebook', qty: 1 }], shipping: { country: 'GB' } })).body.totals;
	assert.equal(digital.shipping, 0, 'digital goods never ship');
	const ebook = (await book('The Hidden Life of Tide Pools')).formats.find((f) => f.type === 'ebook').price;
	assert.equal(digital.tax, Math.round(ebook * 0.2 * 100) / 100);
	assert.equal((await quote({ items: [{ book: cheap, qty: 1 }], shipping: { country: 'ZZ' } })).status, 400);
	// digital quantity is capped at one and you cannot buy what you own
	assert.equal((await quote({ items: [{ book: pride, format: 'ebook', qty: 5 }] })).body.totals.lineCount, 1);
	assert.equal((await quote({ items: [{ book: await id('Pride and Prejudice'), format: 'ebook', qty: 1 }] })).status, 409);
	assert.equal((await quote({ items: [{ book: cheap, format: 'vinyl', qty: 1 }] })).status, 400);
	// gift wrap fee only for physical goods
	assert.equal((await quote({ items: [{ book: cheap, qty: 1 }], giftWrap: true, giftMessage: 'Enjoy!' })).body.totals.giftWrap, 3.5);
	assert.equal((await quote({ items: [{ book: pride, format: 'ebook', qty: 1 }], giftWrap: true })).body.totals.giftWrap, 0);
	// box set discount only applies when the whole set is in the cart
	const bundle = (await api().get('/api/bundles/the-coroner-files-collection')).body;
	const items = bundle.books.map((b) => ({ book: b._id, format: 'paperback', qty: 1, bundle: bundle._id }));
	const partial = (await quote({ items: items.slice(0, 2) })).body.totals;
	assert.equal(partial.bundleDiscount, 0);
	const whole = (await quote({ items })).body.totals;
	assert.equal(whole.bundleDiscount, Math.round(bundle.listPrice * 0.12 * 100) / 100);
	// coupon + points are capped and validated
	const c = (await quote({ items: [{ book: ember, qty: 1 }], couponCode: 'welcome10', points: 100000 })).body.totals;
	assert.equal(c.couponDiscount, 2.2);
	const balance = (await api().get('/api/me/loyalty').set(reader.h)).body.points;
	assert.equal(c.pointsUsed, Math.min(balance, Math.floor((21.99 - 2.2) * 0.5 * 100)), 'limited by the balance and by half of the goods');
	assert.equal(c.maxPoints, 989);
	assert.equal((await quote({ items: [{ book: ember, qty: 1 }], couponCode: 'SUMMER20' })).body.error, 'This coupon has expired');
	assert.equal((await quote({ items: [{ book: cheap, qty: 1 }], couponCode: 'READMORE5' })).body.error, 'Spend at least $30.00 to use this coupon');
	assert.equal((await quote({ items: [{ book: cheap, qty: 1 }], couponCode: 'NOPE' })).status, 400);
	assert.equal((await api().post('/api/coupons/validate').set(reader.h).send({ code: 'WELCOME10', items: [{ book: ember, qty: 1 }] })).body.discount, 2.2);
});

test('gift cards: buy, issue once paid, pay with a card, refund on cancel', async () => {
	const buy = await api().post('/api/payments/checkout').set(other.h).send({ items: [{ giftCard: { amount: 40, toName: 'Pal', toEmail: 'user@example.com', message: 'For you' } }] });
	assert.equal(buy.status, 201);
	const o = buy.body.order;
	assert.equal(o.total, 40, 'no tax, no shipping on gift cards');
	assert.equal(o.status, 'delivered');
	const code = o.items[0].code;
	assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
	assert.equal(o.pointsEarned, 0, 'gift cards earn no points');
	// the recipient sees it and is notified
	const mine = (await api().get('/api/me/giftcards').set(reader.h)).body;
	assert.ok(mine.some((c) => c.code === code && c.direction === 'received'));
	assert.ok((await api().get('/api/me/notifications').set(reader.h)).body.items.some((n) => n.title === 'You received a gift card'));
	assert.equal((await api().post('/api/giftcards/check').set(reader.h).send({ code })).body.balance, 40);
	assert.equal((await api().post('/api/giftcards/check').set(reader.h).send({ code: 'AAAA-AAAA-AAAA-AAAA' })).status, 404);
	// pay with it: total 14.61 -> card covers all, order is paid by gift card
	const cheap = await id('Salt, Ink, Ash');
	const pay = await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ book: cheap, qty: 1 }], shipping: ship, giftCardCode: code });
	assert.equal(pay.status, 201);
	assert.equal(pay.body.order.giftCardApplied, 14.61);
	assert.equal(pay.body.order.amountDue, 0);
	assert.equal(pay.body.order.paymentStatus, 'paid (gift card)');
	assert.equal((await store.one('giftcards', { code })).balance, 25.39);
	// cancelling restores the card balance
	assert.equal((await api().post(`/api/orders/${pay.body.order._id}/cancel`).set(reader.h)).status, 200);
	assert.equal((await store.one('giftcards', { code })).balance, 40);
	// the order that bought the card cannot be cancelled once the card is used
	await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ book: cheap, qty: 1 }], shipping: ship, giftCardCode: code });
	assert.equal((await api().post(`/api/orders/${o._id}/cancel`).set(other.h)).status, 409);
	assert.equal((await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ giftCard: { amount: 1 } }] })).status, 400);
	assert.equal((await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ book: cheap, qty: 1 }], giftCardCode: 'BAD' })).status, 400);
});

test('loyalty: points earned, tiers, redemption and the ledger', async () => {
	await api().post(`/api/admin/users/${other.user.id}/points`).set(admin.h).send({ delta: 300, note: 'Test credit' });
	const before = (await api().get('/api/me/loyalty').set(other.h)).body;
	assert.equal(before.tier.id, 'bronze');
	const b = await H.mkBook({ title: 'Loyalty Book', price: 20, stock: 10 });
	const r1 = await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: String(b._id), qty: 1 }], shipping: ship });
	assert.equal(r1.body.order.pointsEarned, 20);
	const mid = (await api().get('/api/me/loyalty').set(other.h)).body;
	assert.equal(mid.points, before.points + 20);
	// redeem: 100 points = $1
	const r2 = await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: String(b._id), qty: 1 }], shipping: ship, points: 500 });
	assert.equal(r2.body.order.pointsUsed, 500);
	assert.equal(r2.body.order.pointsDiscount, 5);
	const after = (await api().get('/api/me/loyalty').set(other.h)).body;
	assert.equal(after.points, mid.points - 500 + r2.body.order.pointsEarned);
	assert.ok(after.ledger.some((l) => l.type === 'redeem' && l.delta === -500));
	assert.equal((await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: String(b._id), qty: 1 }], shipping: ship, points: 1 })).body.order.pointsUsed, 1, 'balance is enough for 1 point');
	// not enough points: request is clamped to the balance, never negative
	const poor = await H.register('poor@example.com');
	const q = await api().post('/api/checkout/quote').set(poor.h).send({ items: [{ book: String(b._id), qty: 1 }], points: 999 });
	assert.equal(q.body.totals.pointsUsed, 0);
	// admin adjustments
	const u = await store.one('users', { email: 'poor@example.com' });
	assert.equal((await api().post(`/api/admin/users/${u._id}/points`).set(admin.h).send({ delta: -5 })).status, 400);
	assert.equal((await api().post(`/api/admin/users/${u._id}/points`).set(admin.h).send({ delta: 600, note: 'Welcome' })).body.tier, 'silver');
});

test('pre-orders: flagged, status preorder until release, then settled', async () => {
	const pre = await id('Penhale and the Last Train');
	const detail = (await api().get(`/api/books/${pre}`)).body;
	assert.equal(detail.upcoming, true);
	const res = await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: pre, format: 'hardcover', qty: 1 }], shipping: ship });
	assert.equal(res.status, 201);
	assert.equal(res.body.order.status, 'preorder');
	assert.equal(res.body.order.items[0].preorder, true);
	// digital pre-order cannot be read before release
	assert.equal((await api().get(`/api/books/${pre}/text?format=ebook`)).status, 403);
	await store.update('books', pre, { publishedAt: new Date(Date.now() - 3600000).toISOString() });
	const orders = (await api().get('/api/orders/mine').set(other.h)).body;
	assert.equal(orders.find((o) => o._id === res.body.order._id).status, 'placed', 'released pre-orders move on automatically');
	assert.ok((await api().get('/api/me/notifications').set(other.h)).body.items.some((n) => /pre-order has been released/.test(n.title)));
});

test('back-in-stock alerts fire when staff restock', async () => {
	const b = await H.mkBook({ title: 'Sold Out Wonder', price: 9, stock: 0, formats: [{ type: 'paperback', price: 9, stock: 0 }, { type: 'ebook', price: 3 }] });
	const bid = String(b._id);
	assert.equal((await api().post(`/api/books/${bid}/notify`).set(reader.h).send({ format: 'ebook' })).status, 400);
	assert.equal((await api().post(`/api/books/${bid}/notify`).set(reader.h).send({ format: 'paperback' })).body.subscribed, true);
	assert.equal((await api().get(`/api/books/${bid}/extras`).set(reader.h)).body.alerts[0], 'paperback');
	const inStock = await id('Ember Court');
	assert.equal((await api().post(`/api/books/${inStock}/notify`).set(reader.h).send({ format: 'paperback' })).status, 400, 'already in stock');
	assert.equal((await api().patch(`/api/books/${bid}/stock`).set(reader.h).send({ format: 'paperback', delta: 5 })).status, 403);
	assert.equal((await api().patch(`/api/books/${bid}/stock`).set(staff.h).send({ format: 'paperback', delta: -1 })).status, 400);
	assert.equal((await api().patch(`/api/books/${bid}/stock`).set(staff.h).send({ format: 'ebook', delta: 1 })).status, 400);
	const upd = await api().patch(`/api/books/${bid}/stock`).set(staff.h).send({ format: 'paperback', delta: 4, reason: 'Delivery' });
	assert.equal(upd.status, 200);
	assert.equal(upd.body.stock, 4);
	const note = (await api().get('/api/me/notifications').set(reader.h)).body.items.find((n) => n.title === 'Back in stock: Sold Out Wonder');
	assert.ok(note);
	assert.equal(await store.count('stockAlerts', { book: bid }), 0, 'alerts are consumed');
	const moves = (await api().get(`/api/staff/stock-moves?book=${bid}`).set(staff.h)).body;
	assert.equal(moves[0].to, 4);
	assert.equal(moves[0].by, 'Sam Staff');
});

test('returns: request, approve, receive, refund with restock and points reversal; window and quantities enforced', async () => {
	const b = await H.mkBook({ title: 'Returnable', price: 30, stock: 10 });
	const bid = String(b._id);
	const o = (await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: bid, qty: 2 }], shipping: ship })).body.order;
	const body = { items: [{ book: bid, format: 'paperback', qty: 1 }], reason: 'damaged', note: 'Torn cover' };
	assert.equal((await api().post(`/api/orders/${o._id}/returns`).set(other.h).send(body)).status, 409, 'not delivered yet');
	await api().patch(`/api/admin/orders/${o._id}/status`).set(staff.h).send({ status: 'delivered' });
	assert.equal((await api().post(`/api/orders/${o._id}/returns`).set(reader.h).send(body)).status, 404, 'other customers cannot see it');
	assert.equal((await api().post(`/api/orders/${o._id}/returns`).set(other.h).send({ ...body, reason: 'nope' })).status, 400);
	assert.equal((await api().post(`/api/orders/${o._id}/returns`).set(other.h).send({ ...body, items: [{ book: bid, format: 'paperback', qty: 3 }] })).status, 400);
	const ret = await api().post(`/api/orders/${o._id}/returns`).set(other.h).send(body);
	assert.equal(ret.status, 201);
	assert.equal(ret.body.status, 'requested');
	const expected = Math.round((30 * (1 + o.tax / o.subtotal)) * 100) / 100;
	assert.equal(ret.body.amount, expected, 'item price plus its share of tax');
	assert.equal((await api().post(`/api/orders/${o._id}/returns`).set(other.h).send({ ...body, items: [{ book: bid, format: 'paperback', qty: 2 }] })).status, 409, 'only one copy is left to return');
	assert.ok((await api().get('/api/staff/returns?status=requested').set(staff.h)).body.some((r) => r._id === ret.body._id));
	assert.equal((await api().post(`/api/staff/returns/${ret.body._id}/decision`).set(other.h).send({ status: 'approved' })).status, 403);
	assert.equal((await api().post(`/api/staff/returns/${ret.body._id}/decision`).set(staff.h).send({ status: 'refunded' })).status, 409, 'must be approved first');
	const stock0 = (await store.get('books', bid)).stock;
	const pts0 = (await store.get('users', other.user.id)).points;
	for (const status of ['approved', 'received']) assert.equal((await api().post(`/api/staff/returns/${ret.body._id}/decision`).set(staff.h).send({ status, note: 'ok' })).status, 200);
	const done = await api().post(`/api/staff/returns/${ret.body._id}/decision`).set(staff.h).send({ status: 'refunded' });
	assert.equal(done.status, 200);
	assert.equal((await store.get('books', bid)).stock, stock0 + 1, 'restocked');
	assert.equal((await store.get('orders', o._id)).refundedTotal, expected);
	assert.ok((await store.get('users', other.user.id)).points < pts0, 'points reversed');
	assert.ok((await api().get('/api/me/notifications').set(other.h)).body.items.some((n) => /return was refunded/.test(n.title)));
	assert.equal((await api().post(`/api/staff/returns/${ret.body._id}/decision`).set(staff.h).send({ status: 'rejected' })).status, 409);
	// window closes
	await store.update('orders', o._id, { deliveredAt: new Date(Date.now() - 40 * 86400000).toISOString() });
	const late = await api().post(`/api/orders/${o._id}/returns`).set(other.h).send(body);
	assert.equal(late.status, 409);
	assert.match(late.body.error, /window has closed/);
	// digital items are not returnable and withdrawn requests are marked
	const d = await H.mkBook({ title: 'Digital Only', formats: [{ type: 'ebook', price: 5 }] });
	const od = (await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: String(d._id), format: 'ebook', qty: 1 }] })).body.order;
	assert.equal(od.status, 'delivered');
	assert.equal((await api().post(`/api/orders/${od._id}/returns`).set(other.h).send({ items: [{ book: String(d._id), format: 'ebook', qty: 1 }], reason: 'other' })).status, 400);
	const o3 = (await api().post('/api/payments/checkout').set(other.h).send({ items: [{ book: bid, qty: 1 }], shipping: ship })).body.order;
	await api().patch(`/api/admin/orders/${o3._id}/status`).set(staff.h).send({ status: 'delivered' });
	const r3 = await api().post(`/api/orders/${o3._id}/returns`).set(other.h).send({ items: [{ book: bid, format: 'paperback', qty: 1 }], reason: 'changed-mind' });
	assert.equal((await api().post(`/api/me/returns/${r3.body._id}/cancel`).set(other.h)).body.status, 'cancelled');
});

test('reviews: helpful votes, spoilers, verified purchase, reports and moderation', async () => {
	const bid = await id('Orbit of Quiet Machines');
	assert.equal((await api().post(`/api/books/${bid}/reviews`).set(other.h).send({ rating: 6 })).status, 400);
	assert.equal((await api().post(`/api/books/${bid}/reviews`).send({ rating: 5 })).status, 401);
	const posted = await api().post(`/api/books/${bid}/reviews`).set(other.h).send({ rating: 5, text: 'The ending! The station was alive all along.', spoiler: true });
	assert.equal(posted.status, 201);
	const list = (await api().get(`/api/books/${bid}/reviews`).set(reader.h)).body;
	const rev = list.reviews.find((r) => r.mine === false && r.spoiler);
	assert.ok(rev, 'spoiler flag is returned');
	assert.equal((await api().post(`/api/reviews/${rev._id}/helpful`).set(other.h)).status, 400, 'no voting on your own review');
	assert.deepEqual((await api().post(`/api/reviews/${rev._id}/helpful`).set(reader.h)).body, { voted: true, helpful: 1 });
	assert.deepEqual((await api().post(`/api/reviews/${rev._id}/helpful`).set(reader.h)).body, { voted: false, helpful: 0 });
	await api().post(`/api/reviews/${rev._id}/helpful`).set(reader.h);
	const sorted = (await api().get(`/api/books/${bid}/reviews?sort=helpful`).set(reader.h)).body.reviews;
	assert.ok(sorted[0].helpful >= sorted[sorted.length - 1].helpful);
	assert.equal(sorted.find((r) => r._id === rev._id).voted, true);
	// verified purchase: the reader bought this title; amelia (seed customer) may not have
	const mineVerified = (await api().get(`/api/books/${bid}/reviews`).set(reader.h)).body.reviews;
	assert.equal(typeof mineVerified[0].verified, 'boolean');
	// editing does not duplicate; rating average updates; reports -> moderation queue -> hide excludes from rating
	await api().post(`/api/books/${bid}/reviews`).set(other.h).send({ rating: 1, text: 'Changed my mind' });
	assert.equal(await store.count('reviews', { book: bid, user: other.user.id }), 1);
	const mine = (await api().get(`/api/books/${bid}/reviews`).set(other.h)).body.reviews.find((r) => r.mine);
	const rating0 = (await book('Orbit of Quiet Machines')).rating;
	assert.equal((await api().post(`/api/reviews/${mine._id}/report`).set(reader.h).send({ reason: 'Rude' })).status, 200);
	await api().post(`/api/reviews/${mine._id}/report`).set(reader.h).send({ reason: 'Rude' });
	const queue = (await api().get('/api/staff/reviews?filter=reported').set(staff.h)).body.reviews;
	assert.equal(queue.find((r) => r._id === mine._id).reports, 1, 'one report per reader');
	assert.equal((await api().get('/api/staff/reviews').set(reader.h)).status, 403);
	assert.equal((await api().post(`/api/staff/reviews/${mine._id}/hide`).set(staff.h).send({ hidden: true, reason: 'Abusive' })).status, 200);
	assert.notEqual((await book('Orbit of Quiet Machines')).rating, rating0);
	assert.equal((await api().get(`/api/books/${bid}/reviews`).set(reader.h)).body.reviews.some((r) => r._id === mine._id), false, 'hidden from other readers');
	assert.equal((await api().get(`/api/books/${bid}/reviews`).set(other.h)).body.reviews.find((r) => r._id === mine._id).hidden, true, 'the author still sees it');
	assert.equal((await api().post(`/api/staff/reviews/${mine._id}/hide`).set(staff.h).send({ hidden: false })).status, 200);
	assert.equal((await api().delete(`/api/staff/reviews/${mine._id}`).set(staff.h)).status, 200);
});

test('Q&A: ask, answer (staff flagged), notify, moderate', async () => {
	const bid = await id('The Octopus Notebook');
	assert.equal((await api().post(`/api/books/${bid}/questions`).set(other.h).send({ text: 'hi' })).status, 400);
	const q = await api().post(`/api/books/${bid}/questions`).set(other.h).send({ text: 'Does it include any colour plates?' });
	assert.equal(q.status, 201);
	assert.ok((await api().get('/api/staff/questions').set(staff.h)).body.some((x) => x._id === q.body._id), 'unanswered queue');
	const a = await api().post(`/api/questions/${q.body._id}/answers`).set(staff.h).send({ text: 'Yes, sixteen pages of colour plates.' });
	assert.equal(a.status, 201);
	assert.equal(a.body.role, 'staff');
	const list = (await api().get(`/api/books/${bid}/questions`)).body.questions;
	assert.equal(list[0].answers.length, 1);
	assert.ok((await api().get('/api/me/notifications').set(other.h)).body.items.some((n) => n.title === 'Your question was answered'));
	assert.equal((await api().delete(`/api/questions/${q.body._id}`).set(reader.h)).status, 403);
	assert.equal((await api().delete(`/api/questions/${q.body._id}`).set(other.h)).status, 200);
});

test('e-reader: sample vs full text, saved progress, bookmarks, highlights and validation', async () => {
	const pp = await id('Pride and Prejudice');
	const guest = (await api().get(`/api/books/${pp}/text?format=ebook`)).body;
	assert.equal(guest.full, false);
	assert.equal(guest.chapters.length, 1);
	assert.equal(guest.totalChapters, 4);
	assert.match(guest.chapters[0].paragraphs[0], /truth universally acknowledged/);
	assert.equal(guest.source, 'Project Gutenberg (public domain)');
	const owner = (await api().get(`/api/books/${pp}/text?format=ebook`).set(reader.h)).body;
	assert.equal(owner.full, true);
	assert.equal(owner.chapters.length, 4);
	const noAudio = (await store.find('books', {})).find((b) => !b.formats.some((f) => f.type === 'audiobook'));
	assert.equal((await api().get(`/api/books/${noAudio._id}/text?format=audiobook`)).status, 404, 'no audiobook for this title');
	// generated text is deterministic and the same for everyone
	const e1 = (await api().get(`/api/books/${await id('The Lantern of Orrin Vale')}/text?format=ebook`).set(reader.h)).body;
	const e2 = (await api().get(`/api/books/${await id('The Lantern of Orrin Vale')}/text?format=ebook`).set(staff.h)).body;
	assert.equal(e1.full, false);
	assert.equal(e2.full, true);
	assert.deepEqual(e2.chapters[0].paragraphs.slice(0, e1.chapters[0].paragraphs.length), e1.chapters[0].paragraphs, 'the sample is the start of the full text');
	assert.equal(new Set(e2.chapters[1].paragraphs.join(' ').split('. ')).size > 8, true, 'generated text avoids repeating sentences');
	// state
	const state = (await api().get(`/api/me/reader/${pp}`).set(reader.h)).body;
	assert.equal(state.highlights[0].color, 'yellow');
	const put = await api().put(`/api/me/reader/${pp}`).set(reader.h).send({ progress: { chapter: 2, para: 4, pct: 61.234 }, bookmarks: [{ chapter: 2, para: 4, label: 'Here' }], highlights: [{ chapter: 0, para: 0, start: 3, end: 15, text: 'truth univer', note: 'nice', color: 'green' }] });
	assert.equal(put.status, 200);
	assert.equal(put.body.progress.pct, 61.2);
	assert.equal(put.body.highlights[0].color, 'green');
	assert.ok(put.body.bookmarks[0].id);
	assert.equal((await api().put(`/api/me/reader/${pp}`).set(reader.h).send({ progress: { chapter: -1, para: 0, pct: 5 } })).status, 400);
	assert.equal((await api().put(`/api/me/reader/${pp}`).set(reader.h).send({ highlights: [{ chapter: 0, para: 0, start: 5, end: 99999 }] })).status, 400);
	assert.equal((await api().put(`/api/me/reader/${pp}`).send({ progress: { chapter: 1, para: 1, pct: 1 } })).status, 401);
	// library: only paid, non-refunded digital purchases, with progress
	const lib = (await api().get('/api/me/library').set(reader.h)).body;
	assert.deepEqual(lib.map((l) => l.book.title).sort(), ["Alice's Adventures in Wonderland", 'Jane Eyre', 'Moby-Dick; or, The Whale', 'Pride and Prejudice']);
	assert.equal(lib.find((l) => l.book.title === 'Pride and Prejudice').progress.pct, 61.2);
	assert.equal((await api().get('/api/me/library').set(other.h)).body.every((l) => l.formats.length > 0), true);
});

test('goals, stats, streaks and activity', async () => {
	const stats = (await api().get('/api/me/stats').set(reader.h)).body;
	assert.equal(stats.finishedCount, 12);
	assert.equal(stats.goal.target, 18);
	assert.equal(stats.goal.finished, 12);
	assert.equal(stats.goal.status, 'behind');
	assert.ok(stats.streak.current >= 9);
	assert.equal(stats.heat.length, 84);
	assert.equal(stats.byMonth.reduce((a, b) => a + b, 0), 12);
	// a new reader: finishing a book updates the goal, activity starts a streak
	const fresh = await H.register('fresh@example.com');
	const bid = await id('Ember Court');
	assert.equal((await api().put('/api/me/goal').set(fresh.h).send({ year: 2026, books: 0 })).status, 400);
	assert.equal((await api().put('/api/me/goal').set(fresh.h).send({ year: 1999, books: 5 })).status, 400);
	const yr = new Date().getUTCFullYear();
	assert.equal((await api().put('/api/me/goal').set(fresh.h).send({ year: yr, books: 5 })).status, 200);
	await api().put(`/api/me/reading-list/${bid}`).set(fresh.h).send({ status: 'finished' });
	assert.equal((await api().post('/api/me/activity').set(fresh.h).send({ minutes: 25, pages: 12 })).status, 200);
	await api().post('/api/me/activity').set(fresh.h).send({ minutes: 5 });
	assert.equal((await api().post('/api/me/activity').set(fresh.h).send({ minutes: 999 })).status, 400);
	assert.equal(await store.count('activity', { user: fresh.user.id }), 1, 'one row per day');
	const s2 = (await api().get('/api/me/stats').set(fresh.h)).body;
	assert.equal(s2.finishedCount, 1);
	assert.equal(s2.goal.pct, 20);
	assert.equal(s2.streak.current, 1);
	assert.equal(s2.minutes, 30);
	const list = (await api().get('/api/me/reading-list').set(fresh.h)).body;
	assert.ok(list[0].finishedAt);
	assert.equal((await api().put(`/api/me/reading-list/${bid}`).set(fresh.h).send({ status: 'nope' })).status, 400);
	assert.equal((await api().delete(`/api/me/reading-list/${bid}`).set(fresh.h)).body.length, 0);
});

test('wishlist sharing by link and recommendations', async () => {
	const off = (await api().get('/api/me/wishlist/share').set(other.h)).body;
	assert.equal(off.enabled, false);
	const bid = await id('Ember Court');
	await api().put(`/api/me/reading-list/${bid}`).set(other.h).send({ status: 'want' });
	const on = (await api().post('/api/me/wishlist/share').set(other.h).send({ enabled: true })).body;
	assert.equal(on.enabled, true);
	const pub = await api().get(`/api/shared/wishlist/${on.token}`);
	assert.equal(pub.status, 200);
	assert.equal(pub.body.owner, 'Amelia');
	assert.equal(pub.body.books[0].book.title, 'Ember Court');
	assert.equal(pub.body.email, undefined);
	assert.equal((await api().get('/api/shared/wishlist/not-a-real-token-at-all-nope')).status, 404);
	await api().post('/api/me/wishlist/share').set(other.h).send({ enabled: false });
	assert.equal((await api().get(`/api/shared/wishlist/${on.token}`)).status, 404, 'revoked links stop working');
	const rec = (await api().get('/api/me/recommendations').set(reader.h)).body;
	assert.ok(rec.sections.length >= 2);
	const owned = new Set((await api().get('/api/me/reading-list').set(reader.h)).body.map((e) => e.book._id));
	for (const s of rec.sections) for (const b of s.books) assert.equal(owned.has(b._id), false, 'never recommends books already on the list');
	assert.ok(rec.sections.some((s) => s.kind === 'follow'), 'authors you follow');
	assert.ok(rec.sections[0].because.title);
});

test('authors, follows and events', async () => {
	const authors = (await api().get('/api/authors?search=wolfe')).body.authors;
	assert.equal(authors[0].name, 'Idris Wolfe');
	const page = (await api().get('/api/authors/Idris%20Wolfe').set(other.h)).body;
	assert.equal(page.stats.count, 4);
	assert.ok(page.profile.bio.length > 20);
	assert.equal((await api().get('/api/books/author/Idris%20Wolfe')).body.author, 'Idris Wolfe');
	assert.equal((await api().get('/api/authors/Nobody%20Here')).status, 404);
	assert.equal((await api().post('/api/authors/idris-wolfe/follow').set(other.h)).body.following, true);
	assert.equal((await api().post('/api/authors/idris-wolfe/follow').set(other.h)).body.followers, 3, 'follow is idempotent (Amelia already followed)');
	// staff add a book by a followed author: followers are notified
	const nb = await api().post('/api/books').set(staff.h).send({ title: 'Wolfe Surprise', author: 'Idris Wolfe', price: 9.99 });
	assert.equal(nb.status, 201);
	assert.ok((await api().get('/api/me/notifications').set(other.h)).body.items.some((n) => n.body === 'Wolfe Surprise'));
	assert.equal((await api().delete('/api/authors/idris-wolfe/follow').set(other.h)).body.following, false);
	assert.equal((await api().put('/api/staff/authors/idris-wolfe').set(staff.h).send({ bio: 'Short bio.', website: 'javascript:1' })).status, 400);
	assert.equal((await api().put('/api/staff/authors/idris-wolfe').set(staff.h).send({ bio: 'Short bio.', location: 'Oslo' })).body.bio, 'Short bio.');
	// events: rsvp, capacity, staff CRUD notifies followers
	const events = (await api().get('/api/events').set(other.h)).body.events;
	assert.equal(events.length, 5);
	const ev = events[0];
	assert.equal((await api().post(`/api/events/${ev._id}/rsvp`).set(other.h).send({ going: true })).body.joined, true);
	assert.equal((await api().get('/api/events').set(other.h)).body.events[0].joined, true);
	const past = (await api().get('/api/events?when=past')).body.events[0];
	assert.equal((await api().post(`/api/events/${past._id}/rsvp`).set(other.h).send({})).status, 409);
	const created = await api().post('/api/staff/events').set(staff.h).send({ title: 'Tiny gathering', author: 'Idris Wolfe', type: 'reading', startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), capacity: 1 });
	assert.equal(created.status, 201);
	assert.equal((await api().post(`/api/events/${created.body._id}/rsvp`).set(reader.h).send({})).body.joined, true);
	assert.equal((await api().post(`/api/events/${created.body._id}/rsvp`).set(other.h).send({})).status, 409, 'full');
	assert.equal((await api().post('/api/staff/events').set(staff.h).send({ title: 'x', type: 'party', startsAt: 'soon' })).status, 400);
	assert.equal((await api().delete(`/api/staff/events/${created.body._id}`).set(staff.h)).status, 200);
});

test('book clubs: create, join, monthly pick, discussions and realtime events', async () => {
	const events = [];
	app.set('io', { to: (room) => ({ emit: (ev, payload) => events.push([room, ev, payload]) }) });
	try {
		assert.equal((await api().post('/api/clubs').send({ name: 'Nope' })).status, 401);
		assert.equal((await api().post('/api/clubs').set(other.h).send({ name: 'ab' })).status, 400);
		const club = await api().post('/api/clubs').set(other.h).send({ name: 'Thursday Thrillers', description: 'Fast books' });
		assert.equal(club.status, 201);
		assert.equal(club.body.members, 1);
		assert.equal((await api().post('/api/clubs').set(other.h).send({ name: 'thursday thrillers' })).status, 409);
		const cid = club.body._id;
		assert.equal((await api().post(`/api/clubs/${cid}/threads`).set(reader.h).send({ title: 'Hello', body: 'Hi all' })).status, 403, 'members only');
		assert.equal((await api().post(`/api/clubs/${cid}/join`).set(reader.h)).body.members, 2);
		assert.equal((await api().post(`/api/clubs/${cid}/join`).set(reader.h)).body.members, 2, 'joining twice is harmless');
		assert.equal((await api().put(`/api/clubs/${cid}/pick`).set(reader.h).send({ bookId: await id('The Ninth Guest') })).status, 403, 'owner only');
		const pick = await api().put(`/api/clubs/${cid}/pick`).set(other.h).send({ bookId: await id('The Ninth Guest'), note: 'Dinner party', discussAt: new Date(Date.now() + 864e5).toISOString() });
		assert.equal(pick.body.pick.book.title, 'The Ninth Guest');
		assert.ok((await api().get('/api/me/notifications').set(reader.h)).body.items.some((n) => /new monthly pick/.test(n.title)));
		const th = await api().post(`/api/clubs/${cid}/threads`).set(reader.h).send({ title: 'Who did it?', body: 'My money is on the butler.' });
		assert.equal(th.status, 201);
		const tid = th.body.thread._id;
		const post = await api().post(`/api/clubs/${cid}/threads/${tid}/posts`).set(other.h).send({ body: 'Spoilers!', spoiler: true });
		assert.equal(post.status, 201);
		assert.ok(events.some(([room, ev]) => room === `club:${cid}` && ev === 'post'), 'realtime event emitted to the club room');
		assert.ok(events.some(([, ev]) => ev === 'thread'));
		const view = (await api().get(`/api/clubs/${cid}/threads/${tid}`).set(other.h)).body;
		assert.equal(view.posts.length, 2);
		assert.equal(view.posts[1].spoiler, true);
		assert.equal(view.posts[1].mine, true);
		const detail = (await api().get(`/api/clubs/${cid}`)).body;
		assert.equal(detail.threads[0].posts, 2);
		assert.equal(detail.members.length, 2);
		assert.equal((await api().delete(`/api/clubs/${cid}/threads/${tid}/posts/${post.body._id}`).set(reader.h)).status, 403);
		assert.equal((await api().delete(`/api/clubs/${cid}/threads/${tid}/posts/${post.body._id}`).set(other.h)).status, 200);
		assert.equal((await api().post(`/api/clubs/${cid}/leave`).set(other.h)).status, 409, 'owner cannot leave');
		assert.equal((await api().post(`/api/clubs/${cid}/leave`).set(reader.h)).body.joined, false);
		assert.equal((await api().delete(`/api/clubs/${cid}`).set(reader.h)).status, 403);
		assert.equal((await api().delete(`/api/clubs/${cid}`).set(other.h)).status, 200);
		assert.equal(await store.count('posts', { club: cid }), 0);
	} finally {
		app.set('io', undefined);
	}
});

test('ISBN lookup (Open Library) with offline fallback, import and quick add', async () => {
	assert.equal((await api().get('/api/staff/isbn/12345').set(staff.h)).status, 400);
	assert.equal((await api().get('/api/staff/isbn/9780306406157').set(reader.h)).status, 403);
	const calls = [];
	app.set('fetch', async (url) => {
		calls.push(url);
		return { ok: true, json: async () => ({ 'ISBN:9780306406157': { title: 'A Borrowed Atlas', subtitle: 'Maps of Elsewhere', authors: [{ name: 'Ola Nilsen' }], publishers: [{ name: 'Harbour House' }], number_of_pages: 280, publish_date: 'March 3, 2019', cover: { medium: 'https://covers.openlibrary.org/b/id/1-M.jpg' }, subjects: [{ name: 'Fantasy fiction' }] } }) };
	});
	try {
		const hit = (await api().get('/api/staff/isbn/978-0-306-40615-7').set(staff.h)).body;
		assert.equal(hit.found, true);
		assert.match(calls[0], /openlibrary\.org\/api\/books\?bibkeys=ISBN:9780306406157/);
		assert.equal(hit.data.title, 'A Borrowed Atlas: Maps of Elsewhere');
		assert.equal(hit.data.genre, 'Fantasy');
		assert.equal(hit.data.publishedAt.slice(0, 10), '2019-03-03');
		const imp = await api().post('/api/staff/isbn/import').set(staff.h).send({ isbn: hit.isbn, ...hit.data, price: 15.5, stock: 8 });
		assert.equal(imp.status, 201);
		assert.equal(imp.body.book.formats[0].isbn, '9780306406157');
		assert.equal(imp.body.book.stock, 8);
		assert.equal((await api().post('/api/staff/isbn/import').set(staff.h).send({ isbn: hit.isbn, ...hit.data, price: 15.5 })).status, 409);
		assert.equal((await api().get('/api/staff/isbn/9780306406157').set(staff.h)).body.existing.title, 'A Borrowed Atlas: Maps of Elsewhere');
		// quick add: known title restocks
		const qa = await api().post('/api/staff/quick-add').set(staff.h).send({ isbn: '9780306406157', qty: 4 });
		assert.equal(qa.body.action, 'restocked');
		assert.equal(qa.body.book.stock, 12);
		// quick add of a new ISBN creates the book from the lookup (the fake returns the same record for any ISBN key it knows)
		app.set('fetch', async () => ({ ok: true, json: async () => ({ 'ISBN:9780140328721': { title: 'Quick One', authors: [{ name: 'Q. Author' }] } }) }));
		const qn = await api().post('/api/staff/quick-add').set(staff.h).send({ isbn: '9780140328721', qty: 3, price: 11 });
		assert.equal(qn.status, 201);
		assert.equal(qn.body.action, 'created');
		assert.equal(qn.body.book.stock, 3);
	} finally {
		app.set('fetch', undefined);
	}
	// offline: graceful fallback, nothing thrown
	app.set('fetch', async () => {
		throw new Error('offline');
	});
	try {
		const off = (await api().get('/api/staff/isbn/9780141439518').set(staff.h)).body;
		assert.equal(off.found, false);
		assert.equal(off.offline, true);
		assert.match(off.message, /enter the details by hand/i);
		assert.equal((await api().post('/api/staff/quick-add').set(staff.h).send({ isbn: '9780141439518', qty: 1 })).status, 404);
		assert.equal((await api().post('/api/staff/isbn/import').set(staff.h).send({ isbn: '9780141439518', title: 'Typed By Hand', author: 'A. Person', price: 7, stock: 2 })).status, 201);
	} finally {
		app.set('fetch', undefined);
	}
});

test('merchandising: collections, box sets and series are staff-managed and validated', async () => {
	const ids = [await id('Ember Court'), await id('Jane Eyre')];
	assert.equal((await api().post('/api/staff/collections').set(reader.h).send({ title: 'x', bookIds: ids })).status, 403);
	assert.equal((await api().post('/api/staff/collections').set(staff.h).send({ title: 'Cold Weather', bookIds: ['nope1234'] })).status, 400);
	const c = await api().post('/api/staff/collections').set(staff.h).send({ title: 'Cold Weather', blurb: 'Warm up', bookIds: ids, featured: true });
	assert.equal(c.status, 201);
	assert.equal(c.body.slug, 'cold-weather');
	assert.equal((await api().post('/api/staff/collections').set(staff.h).send({ title: 'Cold Weather', bookIds: ids })).body.slug, 'cold-weather-2');
	assert.equal((await api().get('/api/collections/cold-weather')).body.books.length, 2);
	const b = await api().post('/api/staff/bundles').set(staff.h).send({ title: 'Cold Duo', bookIds: ids, discountPct: 15 });
	assert.equal(b.status, 201);
	assert.equal((await api().post('/api/staff/bundles').set(staff.h).send({ title: 'Solo', bookIds: [ids[0]], discountPct: 10 })).status, 400, 'a box set needs two books');
	assert.equal((await api().post('/api/staff/bundles').set(staff.h).send({ title: 'Too cheap', bookIds: ids, discountPct: 90 })).status, 400);
	assert.equal((await api().put(`/api/staff/bundles/${b.body._id}`).set(staff.h).send({ discountPct: 25 })).body.discountPct, 25);
	assert.equal((await api().delete(`/api/staff/bundles/${b.body._id}`).set(staff.h)).status, 200);
	assert.equal((await api().delete(`/api/staff/bundles/${b.body._id}`).set(staff.h)).status, 404);
	assert.equal((await api().put('/api/staff/series/the-ashen-kingdoms').set(staff.h).send({ description: 'Updated blurb' })).body.description, 'Updated blurb');
	assert.equal((await api().get('/api/series/the-ashen-kingdoms')).body.series.description, 'Updated blurb');
});

test('admin: users (roles, protections), settings, coupons, gift cards, reports and CSV exports', async () => {
	const users = (await api().get('/api/admin/users?limit=50').set(admin.h)).body;
	assert.ok(users.total >= 11);
	assert.equal(users.users.every((u) => u.password === undefined), true);
	const adminUser = users.users.find((u) => u.email === 'admin@example.com');
	assert.equal((await api().patch(`/api/admin/users/${adminUser._id}`).set(admin.h).send({ role: 'user' })).status, 409, 'not your own role');
	assert.equal((await api().patch(`/api/admin/users/${adminUser._id}`).set(admin.h).send({ disabled: true })).status, 409);
	assert.equal((await api().post('/api/admin/users').set(admin.h).send({ name: 'New Staffer', email: 'new.staff@example.com', password: 'secret123', role: 'staff' })).status, 201);
	assert.equal((await api().post('/api/admin/users').set(admin.h).send({ name: 'x', email: 'new.staff@example.com', password: 'secret123', role: 'staff' })).status, 409);
	const target = users.users.find((u) => u.email === 'noah.fraser@example.com');
	const promoted = await api().patch(`/api/admin/users/${target._id}`).set(admin.h).send({ role: 'staff' });
	assert.equal(promoted.body.role, 'staff');
	assert.equal((await H.login('noah.fraser@example.com')).user.role, 'staff');
	assert.equal((await api().patch(`/api/admin/users/${target._id}`).set(admin.h).send({ role: 'wizard' })).status, 400);
	assert.equal((await api().get('/api/admin/users?q=noah&role=staff').set(admin.h)).body.total, 1);

	// settings feed the pricing rules immediately
	const s0 = (await api().get('/api/admin/settings').set(admin.h)).body;
	assert.equal(s0.shipping.standard, 4.99);
	assert.equal((await api().put('/api/admin/settings').set(admin.h).send({ shipping: { standard: -1 } })).status, 400);
	assert.equal((await api().put('/api/admin/settings').set(admin.h).send({ loyalty: { silverAt: 900, goldAt: 100 } })).status, 400);
	assert.equal((await api().put('/api/admin/settings').set(admin.h).send({ tax: { US: { physical: 2, digital: 0 } } })).status, 400);
	const s1 = await api().put('/api/admin/settings').set(admin.h).send({ shipping: { standard: 6.5, freeOver: 100 }, giftWrap: 2, tax: { US: { physical: 0.1, digital: 0.1 }, NZ: { physical: 0.15, digital: 0.15 } } });
	assert.equal(s1.status, 200);
	assert.equal((await api().get('/api/settings/public')).body.shipping.standard, 6.5);
	const cheap = await id('Salt, Ink, Ash');
	const q = (await api().post('/api/checkout/quote').set(reader.h).send({ items: [{ book: cheap, qty: 1 }], giftWrap: true, shipping: { country: 'NZ' } })).body.totals;
	assert.deepEqual([q.shipping, q.giftWrap, q.tax], [14.5, 2, 1.35], 'edited rates apply to new countries too');
	await api().put('/api/admin/settings').set(admin.h).send({ shipping: { standard: 4.99, freeOver: 35 }, giftWrap: 3.5, tax: { US: { physical: 0.07, digital: 0.07 } } });

	// coupons
	assert.equal((await api().post('/api/admin/coupons').set(admin.h).send({ code: 'x', type: 'percent', value: 10 })).status, 400);
	assert.equal((await api().post('/api/admin/coupons').set(admin.h).send({ code: 'BIG', type: 'percent', value: 150 })).status, 400);
	const cp = await api().post('/api/admin/coupons').set(admin.h).send({ code: 'save15', type: 'percent', value: 15, usageLimit: 1 });
	assert.equal(cp.status, 201);
	assert.equal(cp.body.code, 'SAVE15');
	assert.equal((await api().post('/api/admin/coupons').set(admin.h).send({ code: 'SAVE15', type: 'fixed', value: 1 })).status, 409);
	const used = await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ book: await id('Ember Court'), qty: 1 }], couponCode: 'save15', shipping: ship });
	assert.equal(used.body.order.discount, 3.3);
	assert.equal((await api().post('/api/payments/checkout').set(reader.h).send({ items: [{ book: await id('Ember Court'), qty: 1 }], couponCode: 'SAVE15', shipping: ship })).body.error, 'This coupon has been fully redeemed');
	assert.equal((await api().delete(`/api/admin/coupons/${cp.body._id}`).set(admin.h)).status, 200);

	// complimentary gift card
	const gc = await api().post('/api/admin/giftcards').set(admin.h).send({ amount: 20, toEmail: 'user@example.com' });
	assert.equal(gc.status, 201);
	assert.equal((await api().patch(`/api/admin/giftcards/${gc.body._id}`).set(admin.h).send({ disabled: true })).body.disabled, true);
	assert.equal((await api().post('/api/checkout/quote').set(reader.h).send({ items: [{ book: cheap, qty: 1 }], giftCardCode: gc.body.code })).status, 400, 'disabled cards cannot be used');

	// reports and dashboard
	const rep = (await api().get('/api/admin/reports?from=2026-07-01&to=2026-10-12').set(admin.h)).body;
	assert.ok(rep.kpis.orders > 20);
	assert.ok(rep.byFormat.find((f) => f.name === 'paperback').units > 0);
	assert.equal((await api().get('/api/admin/reports?from=2026-10-12&to=2026-07-01').set(admin.h)).status, 400);
	const stats = (await api().get('/api/admin/stats?days=30').set(admin.h)).body;
	assert.equal(stats.salesByDay.length, 30);

	// CSV exports are role-gated and formula-injection safe
	const csv = await api().get('/api/export/orders.csv').set(staff.h);
	assert.equal(csv.status, 200);
	assert.match(csv.headers['content-type'], /text\/csv/);
	assert.match(csv.headers['content-disposition'], /attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"/);
	assert.match(csv.text, /^Order,Placed,Customer,Email,Status/);
	await store.update('users', other.user.id, { name: '=HYPERLINK("http://evil")' });
	const csv2 = (await api().get('/api/export/users.csv').set(admin.h)).text;
	assert.ok(csv2.includes(`"'=HYPERLINK(""http://evil"")"`), 'cells starting with = are neutralised');
	for (const n of ['inventory', 'returns']) assert.equal((await api().get(`/api/export/${n}.csv`).set(staff.h)).status, 200);
	for (const n of ['users', 'sales']) assert.equal((await api().get(`/api/export/${n}.csv`).set(admin.h)).status, 200);
	assert.equal((await api().get('/api/export/secrets.csv').set(admin.h)).status, 404);
});

test('inventory and staff overview', async () => {
	const inv = (await api().get('/api/staff/inventory?filter=low').set(staff.h)).body;
	assert.ok(inv.total >= 1);
	assert.ok(inv.books.every((b) => b.formats.some((f) => (f.type === 'paperback' || f.type === 'hardcover') && f.stock > 0 && f.stock <= 5)));
	assert.ok((await api().get('/api/staff/inventory?filter=preorder').set(staff.h)).body.total >= 3);
	assert.equal((await api().get('/api/staff/inventory?q=ember').set(staff.h)).body.books[0].title, 'Ember Court');
	const ov = (await api().get('/api/staff/overview').set(staff.h)).body;
	for (const k of ['toShip', 'preorders', 'returnsOpen', 'reviewsReported', 'questionsOpen', 'lowStock']) assert.equal(typeof ov.counts[k], 'number', k);
});

test('notifications: list, mark read, clear', async () => {
	const n = (await api().get('/api/me/notifications').set(reader.h)).body;
	assert.ok(n.items.length >= 4);
	assert.ok(n.unread >= 1);
	await api().post('/api/me/notifications/read').set(reader.h).send({ ids: [n.items.find((x) => !x.read)._id] });
	assert.equal((await api().get('/api/me/notifications').set(reader.h)).body.unread, n.unread - 1);
	await api().post('/api/me/notifications/read').set(reader.h).send({ all: true });
	assert.equal((await api().get('/api/me/notifications').set(reader.h)).body.unread, 0);
	assert.equal((await api().delete('/api/me/notifications').set(reader.h)).body.removed >= 4, true);
	assert.equal((await api().get('/api/me/notifications')).status, 401);
});

test('reorder keeps current prices and skips unavailable items', async () => {
	const orders = (await api().get('/api/orders/mine').set(reader.h)).body;
	const o = orders.find((x) => x.items.some((i) => i.title === 'Orbit of Quiet Machines'));
	const out = (await api().post(`/api/orders/${o._id}/reorder`).set(reader.h)).body;
	assert.ok(out.items.length >= 1);
	assert.equal(out.items[0].format, 'hardcover');
	assert.equal((await api().post(`/api/orders/${new mongoose.Types.ObjectId()}/reorder`).set(reader.h)).status, 404);
	assert.equal((await api().get(`/api/orders/${o._id}`).set(other.h)).status, 404, 'orders are private');
	assert.equal((await api().get(`/api/orders/${o._id}`).set(staff.h)).body.customer.email, 'user@example.com');
});
