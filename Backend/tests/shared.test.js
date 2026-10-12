// Shared rule modules (pure functions) and the guarantee that the live preview runs the very same code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { diff, from, to } = require('../scripts/sync-shared');
const { toDb, fromDb } = require('../lib/mongostore');

let R, S, RD, M;
test.before(async () => {
	R = await import('../shared/rules.mjs');
	S = await import('../shared/search.mjs');
	RD = await import('../shared/reading.mjs');
	M = await import('../shared/memstore.mjs');
});

test('drift guard: Frontend/src/shared is byte-identical to Backend/shared', () => {
	const bad = diff();
	assert.deepEqual(bad, [], `Out of sync: ${bad.join(', ')}. Run "npm run sync:shared" in Backend.`);
	assert.ok(fs.readdirSync(from).length >= 12);
	assert.deepEqual(fs.readdirSync(from).sort(), fs.readdirSync(to).sort());
});

test('drift guard: the frontend only imports the engine through its own copy and never re-implements the rules', () => {
	const src = path.join(to, '..');
	const offenders = [];
	const walk = (d) => {
		for (const f of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, f.name);
			if (f.isDirectory()) f.name !== 'shared' && walk(p);
			else if (/\.(jsx?|mjs)$/.test(f.name) && /(computeTotals|evalCoupon|shippingFor)\s*=|function (computeTotals|evalCoupon|shippingFor)/.test(fs.readFileSync(p, 'utf8'))) offenders.push(f.name);
		}
	};
	walk(src);
	assert.deepEqual(offenders, [], 'pricing rules must come from src/shared');
});

const settings = () => R.DEFAULT_SETTINGS;
const line = (price, format = 'paperback', qty = 1, extra = {}) => ({ kind: 'book', book: 'b' + price + format, format, price, qty, ...extra });

test('pricing: shipping, free shipping threshold, tiers, express and international', () => {
	const t = (lines, o = {}) => R.computeTotals(lines, {}, o, settings());
	assert.deepEqual([t([line(20)]).shipping, t([line(20)]).tax, t([line(20)]).total], [4.99, 1.4, 26.39]);
	assert.equal(t([line(35)]).shipping, 0);
	assert.equal(t([line(34.99)]).shipping, 4.99);
	assert.equal(t([line(20)], { method: 'express' }).shipping, 11.99);
	assert.equal(t([line(20)], { method: 'express', country: 'DE' }).shipping, 19.99);
	assert.equal(t([line(20)], { country: 'DE' }).tax, 1.4, 'DE printed books 7%');
	assert.equal(t([line(20)], { tier: R.tierFor(2000) }).shipping, 0, 'gold members ship free');
	assert.equal(t([line(20)], { tier: R.tierFor(2000), method: 'express' }).shipping, 11.99, 'express is never free');
	assert.equal(t([line(20, 'ebook')]).shipping, 0);
	assert.equal(t([line(20, 'ebook')], { country: 'GB' }).tax, 4);
	assert.equal(t([line(20, 'paperback'), line(10, 'ebook')], { country: 'GB' }).tax, 2, 'only the digital part is taxed in the UK');
	assert.equal(t([line(20)], { giftWrap: true }).giftWrap, 3.5);
	assert.equal(t([line(20, 'ebook')], { giftWrap: true }).giftWrap, 0);
	assert.equal(t([{ kind: 'giftcard', price: 50, qty: 1 }]).total, 50);
});

test('pricing: discounts are applied in a fixed order and tax follows the discounted amount', () => {
	const bundles = { bx: { title: 'Set', discountPct: 10, bookIds: ['a', 'b'] } };
	const lines = [line(20, 'paperback', 1, { book: 'a', bundle: 'bx' }), line(20, 'paperback', 1, { book: 'b', bundle: 'bx' })];
	const t = R.computeTotals(lines, bundles, { coupon: { active: true, type: 'percent', value: 10, code: 'X' }, pointsToRedeem: 5000, pointsBalance: 5000 }, settings());
	assert.equal(t.bundleDiscount, 4);
	assert.equal(t.couponDiscount, 3.6, '10% of the price after the box-set discount');
	assert.equal(t.pointsUsed, Math.floor((40 - 4 - 3.6) * 0.5 * 100));
	assert.equal(t.discountTotal, round(4 + 3.6 + t.pointsDiscount));
	assert.equal(t.tax, round((40 - t.discountTotal) * 0.07));
	assert.equal(t.total, round(40 - t.discountTotal + 0 + t.tax));
	const half = R.computeTotals([lines[0]], bundles, {}, settings());
	assert.equal(half.bundleDiscount, 0);
	const double = R.computeTotals([{ ...lines[0], qty: 2 }, { ...lines[1], qty: 2 }], bundles, {}, settings());
	assert.equal(double.bundleDiscount, 8);
	// gift card applies last and never exceeds the total; points earned follow the tier bonus
	const g = R.computeTotals([line(20)], {}, { giftCardBalance: 100, tier: R.tierFor(600) }, settings());
	assert.equal(g.giftCardApplied, g.total);
	assert.equal(g.amountDue, 0);
	assert.equal(g.pointsEarned, 25);
	assert.equal(R.computeTotals([line(20)], {}, { coupon: { active: false } }, settings()).error, 'Invalid coupon code');
});
const round = (n) => Math.round(n * 100) / 100;

test('rules: coupons, returns window, tiers, formats, ISBN and CSV safety', () => {
	const c = { active: true, type: 'fixed', value: 5, minSubtotal: 30, used: 0 };
	assert.equal(R.evalCoupon(c, 29.99).ok, false);
	assert.equal(R.evalCoupon(c, 40).discount, 5);
	assert.equal(R.evalCoupon({ ...c, usageLimit: 1, used: 1 }, 40).message, 'This coupon has been fully redeemed');
	assert.equal(R.evalCoupon({ ...c, expiresAt: '2020-01-01' }, 40).message, 'This coupon has expired');
	assert.equal(R.evalCoupon({ type: 'percent', value: 50, active: true }, 10).discount, 5);
	const now = new Date('2026-10-12T00:00:00Z');
	const order = { status: 'delivered', deliveredAt: '2026-10-01T00:00:00Z' };
	assert.deepEqual(R.returnEligibility(order, settings(), now), { ok: true, daysLeft: 19, reason: '' });
	assert.equal(R.returnEligibility({ ...order, deliveredAt: '2026-08-01T00:00:00Z' }, settings(), now).ok, false);
	assert.equal(R.returnEligibility({ status: 'shipped' }, settings(), now).ok, false);
	assert.deepEqual([R.tierFor(0).id, R.tierFor(500).id, R.tierFor(1500).id], ['bronze', 'silver', 'gold']);
	assert.equal(R.tierFor(100).needed, 400);
	assert.equal(R.toIsbn13('0-306-40615-2'), '9780306406157');
	assert.equal(R.toIsbn13('9780306406157'), '9780306406157');
	assert.equal(R.toIsbn13('9780306406158'), '');
	assert.equal(R.validIsbn('080442957X'), true);
	assert.equal(R.cleanIsbn('978-0-306-40615-7'), '9780306406157');
	assert.equal(R.makeIsbn13(7).length, 13);
	assert.ok(R.validIsbn(R.makeIsbn13(7)));
	const legacy = { title: 'Old', price: 9.5, stock: 3 };
	assert.deepEqual(R.bookFormats(legacy), [{ type: 'paperback', price: 9.5, stock: 3 }]);
	const d = R.deriveBook({ ...legacy, formats: [{ type: 'hardcover', price: 20, stock: 2 }, { type: 'ebook', price: 5 }] });
	assert.deepEqual([d.price, d.stock, d.minPrice, d.maxPrice, d.hasDigital], [20, 2, 5, 20, true]);
	assert.equal(R.availability({ ...d, publishedAt: '2020-01-01' }, 'hardcover', now).state, 'low');
	assert.equal(R.availability({ ...d, publishedAt: '2030-01-01' }, 'ebook', now).state, 'preorder');
	assert.equal(R.canBuy({ ...d, publishedAt: '2020-01-01' }, 'ebook', now), true);
	assert.equal(R.csvCell('=SUM(A1)'), "'=SUM(A1)");
	assert.equal(R.csvCell('+1'), "'+1");
	assert.equal(R.csvCell('a,"b"'), '"a,""b"""');
	assert.equal(R.toCsv([{ label: 'A', value: 'a' }], [{ a: 'x' }]), 'A\r\nx\r\n');
	assert.equal(R.slugify("Alice's Adventures: Wonderland!"), 'alice-s-adventures-wonderland');
	const merged = R.mergeSettings({ shipping: { standard: '7' }, tax: { NZ: { physical: 0.15, digital: 0.15 } } });
	assert.equal(merged.shipping.standard, 7);
	assert.equal(merged.shipping.freeOver, 35);
	assert.equal(merged.tax.NZ.physical, 0.15);
	assert.equal(R.freeShippingProgress(20, settings()).remaining, 15);
});

test('search: typos, prefixes, transpositions, ISBN and ranking', () => {
	const books = [
		{ _id: 1, title: 'The Lantern of Orrin Vale', author: 'Maren Ashdown', sold: 5, isbn: '9780306406157' },
		{ _id: 2, title: 'Murder at Lantern Pier', author: 'Harriet Lowell', sold: 50, series: { name: 'Penhale Mysteries' } },
		{ _id: 3, title: 'Pride and Prejudice', author: 'Jane Austen', sold: 1 },
		{ _id: 4, title: 'La Sombra del Cuervo Blanco', author: 'Lucía Marén', sold: 1 },
	];
	const find = (q) => S.searchBooks(books, q).map((r) => r.book._id);
	assert.deepEqual(find('lantern'), [2, 1], 'ties broken by sales');
	assert.deepEqual(find('lantrn orrin'), [1]);
	assert.deepEqual(find('pirde'), [3], 'transposition');
	assert.deepEqual(find('lucía maren'), [4], 'accents ignored');
	assert.deepEqual(find('lucia maren'), [4]);
	assert.deepEqual(find('austen jane'), [3]);
	assert.deepEqual(find('penhale'), [2], 'series name is searched');
	assert.deepEqual(find('978-0-306-40615-7'), [1], 'ISBN');
	assert.deepEqual(find('xyz'), []);
	assert.deepEqual(find('lantern zzz'), [], 'every token must match');
	assert.equal(S.distance('kitten', 'sitting', 5), 3);
	assert.equal(S.distance('ab', 'ba'), 1);
	assert.equal(S.didYouMean(books, 'prejudise'), 'prejudice');
	assert.equal(S.didYouMean(books, 'prejudice'), null);
	assert.equal(S.suggest(books, 'jane').authors[0], 'Jane Austen');
	assert.deepEqual(S.suggest(books, '').books, []);
});

test('reading: streaks, goal pace, stats and deterministic chapters', () => {
	assert.deepEqual(RD.streaks(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-12'), { current: 3, longest: 3, activeToday: true });
	assert.equal(RD.streaks(['2026-10-10', '2026-10-11'], '2026-10-12').current, 2, 'yesterday still counts');
	assert.equal(RD.streaks(['2026-10-01'], '2026-10-12').current, 0);
	assert.equal(RD.streaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'], '2026-10-12').longest, 3);
	const mid = RD.goalProgress({ year: 2026, books: 24 }, 6, '2026-07-02');
	assert.equal(mid.status, 'on-track' === mid.status ? 'on-track' : mid.status);
	assert.equal(RD.goalProgress({ year: 2026, books: 24 }, 2, '2026-07-02').status, 'behind');
	assert.equal(RD.goalProgress({ year: 2026, books: 24 }, 20, '2026-07-02').status, 'ahead');
	assert.equal(RD.goalProgress({ year: 2026, books: 24 }, 24, '2026-07-02').status, 'done');
	assert.equal(RD.goalProgress({ year: 2026, books: 10 }, 5, '2026-10-12').pct, 50);
	assert.equal(RD.goalProgress(null, 5, '2026-10-12'), null);
	const stats = RD.readingStats({ finished: [{ book: { genre: 'A', pages: 100 }, finishedAt: '2026-02-03T10:00:00Z' }, { book: { genre: 'A', pages: 50 }, finishedAt: '2026-02-20T10:00:00Z' }, { book: { genre: 'B', pages: 10 }, finishedAt: '2025-12-31T10:00:00Z' }], activity: [{ date: '2026-10-12', minutes: 30 }], goal: { year: 2026, books: 10 }, today: '2026-10-12', year: 2026 });
	assert.deepEqual([stats.finishedCount, stats.pages, stats.favouriteGenre, stats.byMonth[1], stats.minutes], [2, 150, 'A', 2, 30]);
	const book = { slug: 'x', title: 'Generated', author: 'Anon', genre: 'Mystery', excerpt: 'First para.\n\nSecond para.' };
	const a = RD.chaptersFor(book, {});
	assert.deepEqual(a, RD.chaptersFor(book, {}), 'deterministic');
	assert.equal(a.length, 3);
	assert.deepEqual(a[0].paragraphs.slice(0, 2), ['First para.', 'Second para.']);
	assert.equal(RD.sampleChapters(a).length, 1);
	assert.ok(RD.sampleChapters(a)[0].paragraphs.length < a[0].paragraphs.length);
	assert.equal(RD.chaptersFor({ ...book, genre: 'Poetry' }, {}).length, 4);
	assert.equal(RD.chaptersFor(book, { x: { chapters: [{ title: 'Real', paragraphs: ['p'] }] } })[0].title, 'Real');
	assert.ok(RD.readingMinutes(RD.wordCount(a)) >= 1);
});

test('memory store matches the documented query and update operators', async () => {
	const s = M.createMemStore();
	await s.insert('t', { _id: 'a', n: 1, tags: ['x', 'y'], items: [{ book: 'b1', q: 2 }, { book: 'b2', q: 1 }] });
	await s.insert('t', { n: 5, tags: ['y'], items: [] });
	assert.equal((await s.find('t', { tags: 'x' })).length, 1, 'array membership');
	assert.equal((await s.find('t', { 'items.book': 'b2' })).length, 1, 'dotted path through arrays');
	assert.equal((await s.find('t', { n: { $gte: 2 } })).length, 1);
	assert.equal((await s.find('t', { $or: [{ n: 1 }, { n: 5 }] })).length, 2);
	assert.equal((await s.find('t', {}, { sort: { n: -1 }, limit: 1 }))[0].n, 5);
	assert.equal(await s.atomic('t', { _id: 'a', n: { $gte: 5 } }, { $inc: { n: -1 } }), 0, 'guard fails');
	assert.equal(await s.atomic('t', { _id: 'a', n: { $gte: 1 } }, { $inc: { n: -1 }, $addToSet: { tags: 'z' }, $pull: { tags: 'x' } }), 1);
	assert.deepEqual([(await s.get('t', 'a')).n, (await s.get('t', 'a')).tags], [0, ['y', 'z']]);
	await s.atomic('t', { _id: 'a' }, { $inc: { 'items.0.q': -1 } });
	assert.equal((await s.get('t', 'a')).items[0].q, 1);
	const before = await s.get('t', 'a');
	before.n = 99;
	assert.equal((await s.get('t', 'a')).n, 0, 'reads are copies');
	assert.equal(await s.removeWhere('t', { n: 5 }), 1);
	assert.equal(await s.count('t'), 1);
});

test('Mongo adapter converts only id-like keys to ObjectIds and back', () => {
	const id = '6acc9d3d318b5c2b1930ebc2';
	const out = toDb({ _id: id, user: id, body: id, items: [{ book: id, title: id }], members: [id], $or: [{ book: id }] });
	assert.equal(out._id.constructor.name, 'ObjectId');
	assert.equal(out.body, id, 'free text that looks like an id is left alone');
	assert.equal(out.items[0].book.constructor.name, 'ObjectId');
	assert.equal(out.items[0].title, id);
	assert.equal(out.members[0].constructor.name, 'ObjectId');
	assert.equal(out.$or[0].book.constructor.name, 'ObjectId');
	assert.equal(toDb({ 'items.book': id })['items.book'].constructor.name, 'ObjectId');
	assert.equal(toDb({ _id: 'main' })._id, 'main');
	assert.equal('x' in toDb({ x: undefined, y: 1 }), false);
	const back = fromDb(out);
	assert.equal(back._id, id);
	assert.equal(back.items[0].book, id);
	assert.equal(fromDb({ d: new Date('2026-01-01T00:00:00Z') }).d, '2026-01-01T00:00:00.000Z');
});
