// Loads the full sample data set (books, accounts, orders, reviews, clubs, events, ...) into an EMPTY database:
//   node scripts/seed.js            (or `npm run seed`)
// It refuses to touch a database that already has books. `--reset` first deletes this app's collections, and is
// only allowed on databases whose name starts with "bk_" (throwaway) unless you also pass `--i-know-this-deletes-data`.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const app = require('../app');
const { engine, store, buildContext } = require('../lib/engine');
const { ensureIndexes } = require('../lib/mongostore');

const COLLECTIONS = ['books', 'users', 'orders', 'reviews', 'coupons', 'authors', 'follows', 'events', 'series', 'collections', 'bundles', 'clubs', 'threads', 'posts', 'questions', 'notifications', 'readerStates', 'activity', 'giftcards', 'giftLedger', 'pointsLedger', 'returns', 'stockAlerts', 'stockMoves', 'settings'];

(async () => {
	if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'seed-script-only';
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bookStore');
	const name = mongoose.connection.name;
	if (process.argv.includes('--reset')) {
		if (!name.startsWith('bk_') && !process.argv.includes('--i-know-this-deletes-data')) {
			console.error(`Refusing to reset "${name}". Pass --i-know-this-deletes-data if you really mean it.`);
			process.exit(1);
		}
		for (const c of COLLECTIONS) await mongoose.connection.db.collection(c).deleteMany({});
	}
	if ((await store.count('books')) > 0) {
		console.log(`Database "${name}" already has books; nothing was changed. Use an empty database, or --reset.`);
		return mongoose.disconnect();
	}
	await ensureIndexes();
	const info = await engine.seedStore(buildContext(app), { catalog: require('../shared/catalog.json'), classics: require('../shared/classics.json') });
	console.log(`Seeded "${name}": ${info.books} books, ${info.users} users, ${info.orders} orders, ${info.bundles} box sets`);
	console.log('Sample logins (password Password123!, local sample data only): user@example.com (customer), staff@example.com (staff), admin@example.com (admin)');
	await mongoose.disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
