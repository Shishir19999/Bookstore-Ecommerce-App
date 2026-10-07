// Loads the sample catalog (scripts/catalog.json) into MongoDB. Used by the first-run auto-seed and `npm run seed`.
const Book = require('../models/Book');
const Review = require('../models/Review');
const catalog = require('../scripts/catalog.json');

const DAY = 86400000;

// Upserts books by title+author (sample reviews are replaced). Never deletes anything else.
async function loadCatalog() {
	const ids = [];
	for (const b of catalog.books) {
		const doc = await Book.findOneAndUpdate(
			{ title: b.title, author: b.author },
			{ $set: { ...b, publishedAt: new Date(b.publishedAt) } },
			{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
		);
		ids.push(doc._id);
	}
	await Review.deleteMany({ book: { $in: ids }, user: { $exists: false } });
	const now = Date.now();
	await Review.insertMany(
		catalog.reviews.map((r) => ({
			book: ids[r.book],
			name: r.name,
			rating: r.rating,
			text: r.text,
			createdAt: new Date(now - r.daysAgo * DAY),
			updatedAt: new Date(now - r.daysAgo * DAY),
		})),
		{ timestamps: false }
	);
	return { books: ids.length, reviews: catalog.reviews.length, ids };
}

module.exports = { loadCatalog, GENRE_BLURBS: catalog.genres };
