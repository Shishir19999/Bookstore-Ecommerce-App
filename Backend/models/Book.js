const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
	title: { type: String, required: true, trim: true },
	author: { type: String, required: true, trim: true, index: true },
	genre: { type: String, trim: true },
	language: { type: String, trim: true, default: 'English' },
	description: String,
	// Short sample passage shown as the "preview" on the detail page.
	excerpt: String,
	price: { type: Number, required: true, min: 0 },
	image: String,
	pages: { type: Number, min: 1 },
	// Inventory and sales counters (stock is decremented when an order is placed).
	stock: { type: Number, default: 50, min: 0 },
	sold: { type: Number, default: 0, min: 0 },
	// Denormalised from reviews so lists can filter/sort on them.
	rating: { type: Number, default: 0, min: 0, max: 5 },
	numReviews: { type: Number, default: 0, min: 0 },
	publishedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Book', bookSchema);
