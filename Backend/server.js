// server.js

require('dotenv').config({ quiet: true });
const http = require('http');
const mongoose = require('mongoose');

if (!process.env.JWT_SECRET) {
	console.error('JWT_SECRET is not set. Add it to Backend/.env (see .env.example). Exiting.');
	process.exit(1);
}

const app = require('./app');
const { engine, store, buildContext } = require('./lib/engine');
const { ensureIndexes } = require('./lib/mongostore');
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Real-time book clubs: clients join `club:<id>` rooms; the engine emits posts into them.
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true } });
app.set('io', io);
io.on('connection', (socket) => {
	socket.on('join', (clubId) => typeof clubId === 'string' && /^[0-9a-f]{24}$/.test(clubId) && socket.join(`club:${clubId}`));
	socket.on('leave', (clubId) => typeof clubId === 'string' && socket.leave(`club:${clubId}`));
});

// Seed the sample catalogue (books, authors, series, box sets, collections, events) into an empty database.
// Accounts, orders and community content are only added by `npm run seed`. Existing data is never deleted.
const seedDatabase = async () => {
	try {
		if ((await store.count('books')) > 0) return;
		await engine.seedStore(buildContext(app), { catalog: require('./shared/catalog.json'), classics: require('./shared/classics.json'), people: false });
		console.log('Database seeded successfully');
	} catch (error) {
		console.error('Error seeding database:', error);
	}
};

// First run: if no admin exists and ADMIN_PASSWORD (min 8 chars) is set, create admin@example.com (or ADMIN_EMAIL).
// Existing accounts are never promoted automatically (that would let anyone who registered the admin email become admin).
const ensureAdmin = async () => {
	try {
		if (await store.one('users', { role: 'admin' })) return;
		const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
		const pw = process.env.ADMIN_PASSWORD;
		if (pw && pw.length >= 8 && !(await store.one('users', { email }))) {
			const ctx = buildContext(app);
			await store.insert('users', { name: 'Admin', email, password: await ctx.hash(pw), role: 'admin', tokenVersion: 0, points: 0, lifetimePoints: 0, country: 'US', readingList: [], goal: null, createdAt: ctx.now() });
			console.log('Created admin ' + email);
		}
	} catch (error) {
		console.error('Error ensuring admin:', error);
	}
};

mongoose
	.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bookStore')
	.then(async () => {
		await ensureIndexes();
		await seedDatabase();
		await ensureAdmin();
	})
	.catch((err) => console.error('MongoDB connection error:', err));

server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
