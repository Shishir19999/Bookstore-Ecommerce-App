// server.js

require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

if (!process.env.JWT_SECRET) {
	console.error('JWT_SECRET is not set. Add it to Backend/.env (see .env.example). Exiting.');
	process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 5000;

const Book = require('./models/Book');
const User = require('./models/User');
const { loadCatalog } = require('./lib/catalog');

// Seed the sample catalog into an empty collection; never delete existing data.
const seedDatabase = async () => {
	try {
		if ((await Book.estimatedDocumentCount()) > 0) return;
		await loadCatalog();
		console.log('Database seeded successfully');
	} catch (error) {
		console.error('Error seeding database:', error);
	}
};

// First run: if no admin exists and ADMIN_PASSWORD (min 8 chars) is set, create admin@example.com (or ADMIN_EMAIL).
// Existing accounts are never promoted automatically (that would let anyone who registered the admin email become
// admin); the seed script (npm run seed) creates/promotes the demo admin explicitly for local development.
const ensureAdmin = async () => {
	try {
		if (await User.exists({ role: 'admin' })) return;
		const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
		const pw = process.env.ADMIN_PASSWORD;
		if (pw && pw.length >= 8 && !(await User.exists({ email }))) {
			await User.create({ name: 'Admin', email, password: pw, role: 'admin' });
			console.log('Created admin ' + email);
		}
	} catch (error) {
		console.error('Error ensuring admin:', error);
	}
};

mongoose
	.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bookStore')
	.then(async () => {
		await seedDatabase();
		await ensureAdmin();
	})
	.catch((err) => console.error('MongoDB connection error:', err));

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
