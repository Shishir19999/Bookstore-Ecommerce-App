const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Book = require('../models/Book');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const STATUSES = ['want', 'reading', 'finished'];

async function listFor(userId) {
	const user = await User.findById(userId).populate('readingList.book');
	// Entries whose book was deleted are hidden.
	return user.readingList.filter((e) => e.book).map((e) => ({ book: e.book, status: e.status, addedAt: e.addedAt }));
}

// GET /api/me/reading-list -> [{ book, status, addedAt }]
router.get('/reading-list', async (req, res, next) => {
	try {
		res.json(await listFor(req.user._id));
	} catch (err) {
		next(err);
	}
});

// PUT /api/me/reading-list/:bookId  body { status: want|reading|finished }  (adds or updates)
router.put('/reading-list/:bookId', async (req, res, next) => {
	try {
		const { bookId } = req.params;
		if (!mongoose.isValidObjectId(bookId)) return res.status(400).json({ error: 'Invalid book id' });
		const status = req.body?.status ?? 'want';
		if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
		if (!(await Book.exists({ _id: bookId }))) return res.status(404).json({ error: 'Book not found' });
		const updated = await User.updateOne({ _id: req.user._id, 'readingList.book': bookId }, { $set: { 'readingList.$.status': status } });
		if (!updated.matchedCount) await User.updateOne({ _id: req.user._id }, { $push: { readingList: { book: bookId, status } } });
		res.json(await listFor(req.user._id));
	} catch (err) {
		next(err);
	}
});

router.delete('/reading-list/:bookId', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.bookId)) return res.status(400).json({ error: 'Invalid book id' });
		await User.updateOne({ _id: req.user._id }, { $pull: { readingList: { book: req.params.bookId } } });
		res.json(await listFor(req.user._id));
	} catch (err) {
		next(err);
	}
});

module.exports = router;
