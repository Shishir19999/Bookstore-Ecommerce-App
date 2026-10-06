const mongoose = require('mongoose');
const Book = require('../models/Book');

class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

// Validates { items: [{book, qty}] } and prices it from the DB. Never trusts client prices.
async function priceCart(items) {
	if (!Array.isArray(items) || items.length === 0 || items.length > 50)
		throw new HttpError(400, 'items must be a non-empty array (max 50)');
	const qtyById = new Map();
	for (const it of items) {
		const id = it?.book;
		const qty = it?.qty;
		if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid book id in items');
		if (!Number.isInteger(qty) || qty < 1 || qty > 20)
			throw new HttpError(400, 'qty must be an integer between 1 and 20');
		qtyById.set(String(id), Math.min((qtyById.get(String(id)) || 0) + qty, 20));
	}
	const books = await Book.find({ _id: { $in: [...qtyById.keys()] } });
	if (books.length !== qtyById.size) throw new HttpError(400, 'One or more books no longer exist');
	const lines = books.map((b) => ({ book: b._id, title: b.title, price: b.price, qty: qtyById.get(String(b._id)) }));
	const total = Math.round(lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
	return { lines, total };
}

module.exports = { priceCart, HttpError };
