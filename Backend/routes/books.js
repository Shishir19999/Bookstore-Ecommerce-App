const express = require('express');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const Review = require('../models/Review');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { coverUpload, removeUploaded } = require('../middleware/upload');

const router = express.Router();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
	title: { title: 1 },
	'price-asc': { price: 1, title: 1 },
	'price-desc': { price: -1, title: 1 },
	rating: { rating: -1, numReviews: -1, title: 1 },
	newest: { publishedAt: -1, title: 1 },
	bestselling: { sold: -1, title: 1 },
};
const num = (v) => (v === undefined || v === '' ? NaN : Number(v));
const FEATURED_LIMIT = 8;

// GET /api/books?search=&genre=&language=&author=&minPrice=&maxPrice=&minRating=&inStock=1&sort=&page=1&limit=8
router.get('/', async (req, res, next) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
		const filter = {};
		const q = req.query;
		if (typeof q.search === 'string' && q.search.trim()) {
			const re = new RegExp(escapeRe(q.search.trim()), 'i');
			filter.$or = [{ title: re }, { author: re }];
		}
		if (typeof q.genre === 'string' && q.genre.trim()) filter.genre = q.genre.trim();
		if (typeof q.language === 'string' && q.language.trim()) filter.language = q.language.trim();
		if (typeof q.author === 'string' && q.author.trim()) filter.author = q.author.trim();
		const min = num(q.minPrice);
		const max = num(q.maxPrice);
		if (Number.isFinite(min) || Number.isFinite(max)) {
			filter.price = {};
			if (Number.isFinite(min)) filter.price.$gte = min;
			if (Number.isFinite(max)) filter.price.$lte = max;
		}
		const minRating = num(q.minRating);
		if (Number.isFinite(minRating) && minRating > 0) filter.rating = { $gte: minRating };
		if (q.inStock === '1' || q.inStock === 'true') filter.stock = { $gt: 0 };
		const sort = SORTS[q.sort] || SORTS.title;

		const [books, total, genres, languages, range] = await Promise.all([
			Book.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
			Book.countDocuments(filter),
			Book.distinct('genre'),
			Book.distinct('language'),
			Book.aggregate([{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }]),
		]);
		res.json({
			books,
			page,
			limit,
			total,
			pages: Math.max(Math.ceil(total / limit), 1),
			genres: genres.filter(Boolean).sort(),
			languages: languages.filter(Boolean).sort(),
			priceRange: { min: Math.floor(range[0]?.min ?? 0), max: Math.ceil(range[0]?.max ?? 0) },
		});
	} catch (err) {
		next(err);
	}
});

// GET /api/books/featured -> bestsellers, new arrivals and genre counts for the home page
router.get('/featured', async (req, res, next) => {
	try {
		const [bestsellers, newArrivals, genres, total] = await Promise.all([
			Book.find({ stock: { $gt: 0 } }).sort(SORTS.bestselling).limit(FEATURED_LIMIT),
			Book.find().sort(SORTS.newest).limit(FEATURED_LIMIT),
			Book.aggregate([{ $match: { genre: { $nin: [null, ''] } } }, { $group: { _id: '$genre', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
			Book.countDocuments(),
		]);
		res.json({ bestsellers, newArrivals, genres: genres.map((g) => ({ name: g._id, count: g.count })), total });
	} catch (err) {
		next(err);
	}
});

// GET /api/books/author/:name -> author page data
router.get('/author/:name', async (req, res, next) => {
	try {
		const name = String(req.params.name).trim();
		const books = await Book.find({ author: new RegExp(`^${escapeRe(name)}$`, 'i') }).sort({ publishedAt: -1 });
		if (!books.length) return res.status(404).json({ error: 'Author not found' });
		const rated = books.filter((b) => b.numReviews > 0);
		res.json({
			author: books[0].author,
			books,
			stats: {
				count: books.length,
				genres: [...new Set(books.map((b) => b.genre).filter(Boolean))],
				avgRating: rated.length ? Math.round((rated.reduce((s, b) => s + b.rating, 0) / rated.length) * 10) / 10 : 0,
				sold: books.reduce((s, b) => s + (b.sold || 0), 0),
			},
		});
	} catch (err) {
		next(err);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const book = await Book.findById(req.params.id);
		if (!book) return res.status(404).json({ error: 'Book not found' });
		res.json(book);
	} catch (err) {
		next(err);
	}
});

// GET /api/books/:id/related -> "readers also liked": books bought together with this one, topped up with
// same-author / same-genre titles ordered by rating.
router.get('/:id/related', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const book = await Book.findById(req.params.id);
		if (!book) return res.status(404).json({ error: 'Book not found' });
		const limit = 6;
		const together = await Order.aggregate([
			{ $match: { 'items.book': book._id, status: { $ne: 'cancelled' } } },
			{ $unwind: '$items' },
			{ $match: { 'items.book': { $ne: book._id } } },
			{ $group: { _id: '$items.book', n: { $sum: 1 } } },
			{ $sort: { n: -1 } },
			{ $limit: limit },
		]);
		const ids = together.map((t) => t._id);
		let books = ids.length ? await Book.find({ _id: { $in: ids } }) : [];
		const rank = (b) => ids.findIndex((i) => i.equals(b._id));
		books.sort((a, b) => rank(a) - rank(b));
		if (books.length < limit) {
			const have = [book._id, ...books.map((b) => b._id)];
			const more = await Book.find({ _id: { $nin: have }, $or: [{ author: book.author }, { genre: book.genre }] })
				.sort({ rating: -1, sold: -1 })
				.limit(limit - books.length);
			more.sort((a, b) => (b.author === book.author) - (a.author === book.author)); // same author first
			books = books.concat(more);
		}
		res.json({ books });
	} catch (err) {
		next(err);
	}
});

// ---- Reviews ----
async function refreshRating(bookId) {
	const [agg] = await Review.aggregate([
		{ $match: { book: new mongoose.Types.ObjectId(String(bookId)) } },
		{ $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
	]);
	await Book.updateOne({ _id: bookId }, { rating: agg ? Math.round(agg.avg * 10) / 10 : 0, numReviews: agg ? agg.n : 0 });
}

router.get('/:id/reviews', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const book = await Book.findById(req.params.id);
		if (!book) return res.status(404).json({ error: 'Book not found' });
		const reviews = await Review.find({ book: book._id }).sort({ createdAt: -1 }).limit(100);
		res.json({ reviews, rating: book.rating, numReviews: book.numReviews });
	} catch (err) {
		next(err);
	}
});

// POST /api/books/:id/reviews  body { rating: 1-5, text? }  (one review per user; posting again edits it)
router.post('/:id/reviews', auth, async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const rating = Number(req.body?.rating);
		if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
		const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
		if (text.length > 1000) return res.status(400).json({ error: 'text must be at most 1000 characters' });
		if (!(await Book.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'Book not found' });
		const review = await Review.findOneAndUpdate(
			{ book: req.params.id, user: req.user._id },
			{ $set: { rating, text, name: req.user.name } },
			{ upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
		);
		await refreshRating(req.params.id);
		res.status(201).json(review);
	} catch (err) {
		next(err);
	}
});

router.delete('/:id/reviews/mine', auth, async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const r = await Review.deleteOne({ book: req.params.id, user: req.user._id });
		if (!r.deletedCount) return res.status(404).json({ error: 'You have not reviewed this book' });
		await refreshRating(req.params.id);
		res.json({ deleted: true });
	} catch (err) {
		next(err);
	}
});

// ---- Admin book management ----
const text = (v) => (typeof v === 'string' ? v.trim() : v === undefined ? undefined : null);

// Returns { data } or { error }. partial=true (PUT) only validates provided fields.
function validateBook(body, partial) {
	const data = {};
	const check = (key, max, required) => {
		const v = text(body[key]);
		if (v === undefined) {
			if (required && !partial) return `${key} is required`;
			return null;
		}
		if (v === null) return `${key} must be a string`;
		if (required && !v) return `${key} is required`;
		if (v.length > max) return `${key} must be at most ${max} characters`;
		data[key] = v;
		return null;
	};
	const err =
		check('title', 200, true) ||
		check('author', 120, true) ||
		check('genre', 60, false) ||
		check('language', 40, false) ||
		check('description', 2000, false) ||
		check('excerpt', 4000, false);
	if (err) return { error: err };

	if (body.price === undefined || body.price === '') {
		if (!partial) return { error: 'price is required' };
	} else {
		const price = typeof body.price === 'number' ? body.price : Number(body.price);
		if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'price must be a number between 0 and 100000' };
		data.price = Math.round(price * 100) / 100;
	}

	for (const [key, min, max] of [['stock', 0, 1000000], ['pages', 1, 20000]]) {
		if (body[key] === undefined || body[key] === '') continue;
		const n = Number(body[key]);
		if (!Number.isInteger(n) || n < min || n > max) return { error: `${key} must be a whole number between ${min} and ${max}` };
		data[key] = n;
	}

	const url = text(body.image);
	if (url === null) return { error: 'image must be a string' };
	if (url) {
		let ok = false;
		try {
			ok = ['http:', 'https:'].includes(new URL(url).protocol) && url.length <= 1000;
		} catch {
			/* invalid */
		}
		if (!ok) return { error: 'image must be a valid http(s) URL (or upload a cover file)' };
		data.image = url;
	}
	return { data };
}

const dropUpload = (req) => req.file && removeUploaded(`/uploads/${req.file.filename}`);

// POST /api/books  (admin) JSON or multipart/form-data with optional "cover" file
router.post('/', auth, admin, coverUpload, async (req, res, next) => {
	try {
		const { data, error } = validateBook(req.body || {}, false);
		if (error) {
			dropUpload(req);
			return res.status(400).json({ error });
		}
		if (req.file) data.image = `/uploads/${req.file.filename}`;
		res.status(201).json(await Book.create(data));
	} catch (err) {
		dropUpload(req);
		next(err);
	}
});

// PUT /api/books/:id  (admin) partial update
router.put('/:id', auth, admin, coverUpload, async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) {
			dropUpload(req);
			return res.status(400).json({ error: 'Invalid book id' });
		}
		const { data, error } = validateBook(req.body || {}, true);
		if (error) {
			dropUpload(req);
			return res.status(400).json({ error });
		}
		if (req.file) data.image = `/uploads/${req.file.filename}`;
		const before = await Book.findById(req.params.id);
		if (!before) {
			dropUpload(req);
			return res.status(404).json({ error: 'Book not found' });
		}
		const book = await Book.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true });
		if (data.image && data.image !== before.image) removeUploaded(before.image);
		res.json(book);
	} catch (err) {
		dropUpload(req);
		next(err);
	}
});

// DELETE /api/books/:id  (admin). Past orders keep their title/price snapshot.
router.delete('/:id', auth, admin, async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid book id' });
		const book = await Book.findByIdAndDelete(req.params.id);
		if (!book) return res.status(404).json({ error: 'Book not found' });
		removeUploaded(book.image);
		await Review.deleteMany({ book: book._id });
		res.json({ deleted: true, id: book._id });
	} catch (err) {
		next(err);
	}
});

module.exports = router;
