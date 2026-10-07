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
	for (const b of books) {
		const want = qtyById.get(String(b._id));
		if ((b.stock ?? 0) < want) throw new HttpError(409, b.stock > 0 ? `Only ${b.stock} cop${b.stock === 1 ? 'y' : 'ies'} of "${b.title}" left` : `"${b.title}" is out of stock`);
	}
	const lines = books.map((b) => ({ book: b._id, title: b.title, price: b.price, qty: qtyById.get(String(b._id)) }));
	const total = Math.round(lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
	return { lines, total };
}

// Atomically takes stock for every line (and counts the sale); rolls back and throws 409 if any line cannot be served.
async function reserveStock(lines) {
	const done = [];
	for (const l of lines) {
		const r = await Book.updateOne({ _id: l.book, stock: { $gte: l.qty } }, { $inc: { stock: -l.qty, sold: l.qty } });
		if (r.modifiedCount !== 1) {
			await releaseStock(done);
			throw new HttpError(409, `"${l.title}" is no longer available in that quantity`);
		}
		done.push(l);
	}
}

async function releaseStock(lines) {
	for (const l of lines) await Book.updateOne({ _id: l.book }, { $inc: { stock: l.qty, sold: -l.qty } });
}

// Optional shipping details; only known string fields are kept.
function cleanShipping(s) {
	if (!s || typeof s !== 'object') return undefined;
	const pick = (k, max) => (typeof s[k] === 'string' ? s[k].trim().slice(0, max) : '');
	const out = { name: pick('name', 80), address: pick('address', 200), city: pick('city', 80), postalCode: pick('postalCode', 20) };
	return Object.values(out).some(Boolean) ? out : undefined;
}

module.exports = { priceCart, reserveStock, releaseStock, cleanShipping, HttpError };
