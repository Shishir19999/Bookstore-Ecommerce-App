// Idempotent, deterministic seed: node scripts/seed.js [--reset]  (or `npm run seed` in Backend).
// Upserts books by title+author and users by email; seed orders use fixed _ids.
// --reset additionally deletes ALL orders before reseeding the seed orders.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const Book = require('../models/Book');
const User = require('../models/User');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const { loadCatalog } = require('../lib/catalog');

faker.seed(20261002);
const PASSWORD = 'Password123!';
const REF = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 86400000;
const reset = process.argv.includes('--reset');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

(async () => {
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bookStore');

	// books + sample reviews come from scripts/catalog.json (fictional titles; rebuild with make-catalog.js)
	const loaded = await loadCatalog();
	const books = await Book.find({ _id: { $in: loaded.ids } });

	// users (password hashed by model hook, only on creation)
	const userDefs = [['Admin Demo', 'admin@example.com'], ['Demo User', 'user@example.com']];
	const seen = new Set(userDefs.map((u) => u[1]));
	while (userDefs.length < 20) {
		const f = faker.person.firstName(), l = faker.person.lastName();
		const email = `${slug(f)}.${slug(l)}@example.com`;
		if (seen.has(email)) continue;
		seen.add(email);
		userDefs.push([`${f} ${l}`, email]);
	}
	const users = [];
	for (const [name, email] of userDefs) {
		let u = await User.findOne({ email });
		if (!u) u = await User.create({ name, email, password: PASSWORD });
		const role = email === 'admin@example.com' ? 'admin' : 'user';
		if (u.role !== role) { await User.updateOne({ _id: u._id }, { role }); u.role = role; }
		users.push(u);
	}

	// orders with deterministic ids
	const orders = [];
	for (let i = 0; i < 50; i++) {
		const user = users[faker.number.int({ min: 0, max: users.length - 1 })];
		const picks = faker.helpers.arrayElements(books, faker.number.int({ min: 1, max: 5 }));
		const items = picks.map((b) => ({ _id: new mongoose.Types.ObjectId(), book: b._id, title: b.title, price: b.price, qty: faker.number.int({ min: 1, max: 3 }) }));
		const total = Math.round(items.reduce((s, x) => s + x.price * x.qty, 0) * 100) / 100;
		const createdAt = new Date(REF - faker.number.int({ min: 1, max: 150 }) * DAY - faker.number.int({ min: 0, max: 80000 }) * 1000);
		orders.push({ _id: new mongoose.Types.ObjectId(('b00c' + String(i).padStart(4, '0')).padEnd(24, '0')), user: user._id, items, total, paymentStatus: 'paid (mock)', createdAt, updatedAt: createdAt, __v: 0 });
	}
	if (reset) await Order.deleteMany({});
	else await Order.collection.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
	await Order.collection.insertMany(orders);

	const coupons = [
		{ code: 'WELCOME10', description: '10% off your order', type: 'percent', value: 10 },
		{ code: 'READMORE5', description: '$5 off orders over $30', type: 'fixed', value: 5, minSubtotal: 30 },
		{ code: 'SUMMER20', description: 'Expired summer sale', type: 'percent', value: 20, expiresAt: new Date(REF - 60 * DAY) },
	];
	for (const c of coupons) await Coupon.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });

	console.log(`Seeded: ${await Book.countDocuments()} books, ${await User.countDocuments()} users, ${await Order.countDocuments()} orders`);
	console.log(`Demo logins (password ${PASSWORD}): admin@example.com, user@example.com`);
	await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
