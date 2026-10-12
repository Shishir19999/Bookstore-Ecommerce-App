// Real mode (Express + MongoDB) and the live preview (the same engine over the in-memory store) must answer alike.
// The same scripted session runs against both and the normalised responses are compared.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const FIXED = '2026-10-12T10:00:00.000Z';
let E, mem, memCtx;

test.before(async () => {
	await H.connect();
	H.app.set('now', () => FIXED);
	await H.seed();
	E = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'engine.mjs')).href);
	const store = E.createMemStore();
	memCtx = {
		store,
		now: () => FIXED,
		newId: E.newId,
		hash: async (p) => `h:${p}`,
		verify: async (p, h) => h === `h:${p}`,
		signToken: async (u) => `t.${u._id}.${u.tokenVersion || 0}`,
		verifyToken: async (t) => {
			const [, id, tv] = t.split('.');
			return { id, tv: Number(tv) };
		},
		loadClassics: async () => H.classics,
		emit() {},
		payments: { label: 'mock', mode: () => 'mock' },
	};
	await E.seedStore(memCtx, { catalog: H.catalog, classics: H.classics });
	mem = async (method, url, { body, token } = {}) => {
		const u = new URL(`http://x${url}`);
		try {
			const r = await E.handle(memCtx, { method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, token });
			return { status: r.status, body: JSON.parse(JSON.stringify(r.data)) };
		} catch (e) {
			if (!e.status) throw e;
			return { status: e.status, body: { error: e.message } };
		}
	};
});
test.after(H.cleanup);

const HEX = /^[0-9a-f]{24}$/;
const CODE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
function norm(v) {
	if (typeof v === 'string') return HEX.test(v) ? '<id>' : CODE.test(v) && v !== 'FOLI-OREA-DER5-2026' ? '<code>' : v.replace(/#[0-9A-F]{6}/g, '#<id>');
	if (Array.isArray(v)) return v.map(norm);
	if (v && typeof v === 'object') {
		const o = {};
		for (const k of Object.keys(v).sort()) if (!['token', 'wishlistToken'].includes(k)) o[k] = norm(v[k]);
		return o;
	}
	return v;
}
const real = async (method, url, { body, token } = {}) => {
	let r = H.api()[method.toLowerCase()](url);
	if (token) r = r.set('Authorization', `Bearer ${token}`);
	const res = await (body ? r.send(body) : r);
	return { status: res.status, body: res.body };
};

async function both(method, url, opts = {}) {
	const [a, b] = await Promise.all([real(method, url, { ...opts, token: opts.tokens?.real }), mem(method, url, { ...opts, token: opts.tokens?.mem })]);
	return { a, b };
}
function same(label, { a, b }, pick = (x) => x) {
	assert.equal(a.status, b.status, `${label}: status ${a.status} vs ${b.status} ${JSON.stringify(a.body).slice(0, 120)}`);
	assert.deepEqual(norm(pick(a.body)), norm(pick(b.body)), `${label}: responses differ`)
}

test('read endpoints return the same data in both modes', async () => {
	const tok = {};
	for (const [k, email] of [['user', 'user@example.com'], ['staff', 'staff@example.com'], ['admin', 'admin@example.com']]) {
		const a = await real('POST', '/api/auth/login', { body: { email, password: 'Password123!' } });
		const b = await mem('POST', '/api/auth/login', { body: { email, password: 'Password123!' } });
		assert.equal(a.status, 200);
		assert.equal(b.status, 200);
		assert.deepEqual(norm(a.body.user), norm(b.body.user));
		tok[k] = { real: a.body.token, mem: b.body.token };
	}
	const t = (k) => ({ tokens: tok[k] });
	const strip = (body) => ({ ...body, books: body.books?.map((x) => ({ ...x, createdAt: undefined })) });
	same('books list', await both('GET', '/api/books?limit=50&sort=title'), strip);
	same('books search', await both('GET', '/api/books?search=lantrn%20orrin'));
	same('books filter', await both('GET', '/api/books?format=audiobook&genre=Classics&sort=price-desc'));
	same('suggest', await both('GET', '/api/books/suggest?q=jane%20aus'));
	same('featured', await both('GET', '/api/books/featured'));
	same('series', await both('GET', '/api/series'));
	same('series detail', await both('GET', '/api/series/the-ashen-kingdoms'));
	same('bundles', await both('GET', '/api/bundles'));
	same('collections', await both('GET', '/api/collections'));
	same('authors', await both('GET', '/api/authors?search=wolfe', t('user')));
	same('author page', await both('GET', '/api/authors/Idris%20Wolfe', t('user')));
	same('events', await both('GET', '/api/events', t('user')));
	same('clubs', await both('GET', '/api/clubs', t('user')));
	same('settings', await both('GET', '/api/settings/public'));
	same('stats', await both('GET', '/api/me/stats', t('user')), (b) => ({ ...b, finished: b.finished?.map((f) => f.book.title) }));
	same('library', await both('GET', '/api/me/library', t('user')));
	same('recommendations', await both('GET', '/api/me/recommendations', t('user')));
	same('loyalty', await both('GET', '/api/me/loyalty', t('user')));
	same('orders', await both('GET', '/api/orders/mine', t('user')));
	same('giftcards', await both('GET', '/api/me/giftcards', t('user')));
	same('notifications', await both('GET', '/api/me/notifications', t('user')));
	same('overview', await both('GET', '/api/staff/overview', t('staff')));
	same('admin stats', await both('GET', '/api/admin/stats', t('admin')));
	same('reports', await both('GET', '/api/admin/reports', t('admin')));
	same('staff returns', await both('GET', '/api/staff/returns', t('staff')));
	same('staff reviews', await both('GET', '/api/staff/reviews?filter=reported', t('staff')));
	same('roles are enforced alike', await both('GET', '/api/admin/users', t('user')));
	same('anonymous is rejected alike', await both('GET', '/api/me/stats'));
	same('unknown route', await both('GET', '/api/nope'));
});

test('write flows behave the same in both modes: quote, checkout, reviews, clubs, returns', async () => {
	const tok = {};
	for (const [k, email] of [['user', 'user@example.com'], ['staff', 'staff@example.com']]) {
		const a = await real('POST', '/api/auth/login', { body: { email, password: 'Password123!' } });
		const b = await mem('POST', '/api/auth/login', { body: { email, password: 'Password123!' } });
		tok[k] = { real: a.body.token, mem: b.body.token };
	}
	const t = (k, body) => ({ tokens: tok[k], body });
	const ids = async (title) => {
		const a = (await real('GET', `/api/books?search=${encodeURIComponent(title)}&limit=1`)).body.books[0]._id;
		const b = (await mem('GET', `/api/books?search=${encodeURIComponent(title)}&limit=1`)).body.books[0]._id;
		return { a, b };
	};
	const withIds = async (items) => {
		const ra = [];
		const rb = [];
		for (const it of items) {
			const { a, b } = await ids(it.title);
			ra.push({ ...it, title: undefined, book: a });
			rb.push({ ...it, title: undefined, book: b });
		}
		return { ra, rb };
	};
	const quoteBody = async (items, extra = {}) => {
		const { ra, rb } = await withIds(items);
		return { a: { ...extra, items: ra }, b: { ...extra, items: rb } };
	};
	const call = async (method, url, k, bodies) => {
		const a = await real(method, url.a || url, { token: tok[k].real, body: bodies?.a });
		const b = await mem(method, url.b || url, { token: tok[k].mem, body: bodies?.b });
		return { a, b };
	};
	const q = await quoteBody([{ title: 'Ember Court', format: 'hardcover', qty: 1 }, { title: 'The Hidden Life of Tide Pools', format: 'ebook', qty: 1 }, { title: 'Salt, Ink, Ash', qty: 2 }], { couponCode: 'welcome10', giftWrap: true, giftMessage: 'Hi', shipping: { country: 'DE' }, method: 'express', points: 200, giftCardCode: 'FOLI-OREA-DER5-2026' });
	same('quote', await call('POST', '/api/checkout/quote', 'user', q), (b) => ({ totals: b.totals, tier: b.tier, error: b.error }));
	const bad = await quoteBody([{ title: 'Pride and Prejudice', format: 'ebook', qty: 1 }]);
	same('owned e-book', await call('POST', '/api/checkout/quote', 'user', bad));
	const over = await quoteBody([{ title: 'Orbit of Quiet Machines', qty: 20 }]);
	same('quantity', await call('POST', '/api/checkout/quote', 'user', over), (b) => ({ error: b.error ? b.error.replace(/\d+/g, 'N') : undefined }));
	const co = await quoteBody([{ title: 'Ember Court', format: 'paperback', qty: 1 }, { title: 'The Octopus Notebook', format: 'ebook', qty: 1 }], { shipping: { name: 'A', address: '1 Road', city: 'T', postalCode: '1000', country: 'GB' }, points: 100, couponCode: 'READMORE5' });
	const checkout = await call('POST', '/api/payments/checkout', 'user', co);
	same('checkout', checkout, (b) => ({ mode: b.mode, order: { ...b.order, createdAt: undefined, updatedAt: undefined, _id: undefined } }));
	same('loyalty after', await both('GET', '/api/me/loyalty', { tokens: tok.user }), (b) => ({ points: b.points, lifetime: b.lifetime, tier: b.tier.id, top: b.ledger[0].type }));
	const rv = await quoteBody([{ title: 'Orbit of Quiet Machines', qty: 1 }]);
	void rv;
	const bid = await ids('Orbit of Quiet Machines');
	same('review', await call('POST', { a: `/api/books/${bid.a}/reviews`, b: `/api/books/${bid.b}/reviews` }, 'user', { a: { rating: 4, text: 'Great', spoiler: true }, b: { rating: 4, text: 'Great', spoiler: true } }), (b) => ({ rating: b.rating, spoiler: b.spoiler }));
	same('review again (edit)', await call('POST', { a: `/api/books/${bid.a}/reviews`, b: `/api/books/${bid.b}/reviews` }, 'user', { a: { rating: 2 }, b: { rating: 2 } }), (b) => ({ rating: b.rating }));
	const ra = (await real('GET', `/api/books/${bid.a}`)).body.rating;
	const rb = (await mem('GET', `/api/books/${bid.b}`)).body.rating;
	assert.equal(ra, rb, 'rating recomputed identically');
	const clubs = { a: (await real('POST', '/api/clubs', { token: tok.user.real, body: { name: 'Parity Club' } })), b: (await mem('POST', '/api/clubs', { token: tok.user.mem, body: { name: 'Parity Club' } })) };
	same('club create', clubs, (b) => ({ name: b.name, members: b.members, isOwner: b.isOwner }));
	const ret = await call('POST', `/api/staff/isbn/import`, 'staff', { a: { isbn: '9780306406157', title: 'Parity Import', author: 'P. Author', price: 9, stock: 3 }, b: { isbn: '9780306406157', title: 'Parity Import', author: 'P. Author', price: 9, stock: 3 } });
	same('isbn import', ret, (b) => ({ action: b.action, stock: b.book?.stock, isbn: b.book?.formats?.[0]?.isbn, error: b.error }));
	same('validation errors', await call('PUT', `/api/me/goal`, 'user', { a: { year: 2026, books: 0 }, b: { year: 2026, books: 0 } }));
	same('stock guard', await call('PATCH', { a: `/api/books/${bid.a}/stock`, b: `/api/books/${bid.b}/stock` }, 'staff', { a: { format: 'paperback', delta: -99999 }, b: { format: 'paperback', delta: -99999 } }), (b) => ({ error: b.error }));
});
