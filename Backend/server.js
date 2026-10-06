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

// Seed sample books into an empty collection; never delete existing data.
const seedDatabase = async () => {
	try {
		if ((await Book.estimatedDocumentCount()) > 0) return;

		const books = [
			{ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction', description: 'A classic novel about the American Dream', price: 20, image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240110011815/sutterlin-1362879_640-(1).jpg' },
			{ title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'Fiction', description: 'A powerful story of racial injustice and moral growth', price: 15, image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240110011854/reading-925589_640.jpg' },
			{ title: '1984', author: 'George Orwell', genre: 'Dystopian', description: 'A dystopian vision of a totalitarian future society', price: 255, image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240110011929/glasses-1052010_640.jpg' },
			{ title: 'The Great great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction', description: 'A classic novel about the American Dream', price: 220, image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240110011815/sutterlin-1362879_640-(1).jpg' },
			{ title: '1985', author: 'George Orwell', genre: 'Dystopian', description: 'A dystopian vision of a totalitarian future society', price: 125, image: 'https://media.geeksforgeeks.org/wp-content/uploads/20240110011929/glasses-1052010_640.jpg' },
		];

		await Book.insertMany(books);
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
});app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
