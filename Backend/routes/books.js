const express = require('express');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { coverUpload, removeUploaded } = require('../middleware/upload');

const router = express.Router();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/books?search=&genre=&page=1&limit=8
router.get('/', async (req, res, next) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
		const filter = {};
		if (typeof req.query.search === 'string' && req.query.search.trim()) {
			const re = new RegExp(escapeRe(req.query.search.trim()), 'i');
			filter.$or = [{ title: re }, { author: re }];
		}
		if (typeof req.query.genre === 'string' && req.query.genre.trim()) filter.genre = req.query.genre.trim();

		const [books, total, genres] = await Promise.all([
			Book.find(filter).sort({ title: 1 }).skip((page - 1) * limit).limit(limit),
			Book.countDocuments(filter),
			Book.distinct('genre'),
		]);
		res.json({
			books,
			page,
			limit,
			total,
			pages: Math.max(Math.ceil(total / limit), 1),
			genres: genres.filter(Boolean).sort(),
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
		check('title', 200, true) || check('author', 120, true) || check('genre', 60, false) || check('description', 2000, false);
	if (err) return { error: err };

	if (body.price === undefined || body.price === '') {
		if (!partial) return { error: 'price is required' };
	} else {
		const price = typeof body.price === 'number' ? body.price : Number(body.price);
		if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'price must be a number between 0 and 100000' };
		data.price = Math.round(price * 100) / 100;
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
		res.json({ deleted: true, id: book._id });
	} catch (err) {
		next(err);
	}
});

module.exports = router;
