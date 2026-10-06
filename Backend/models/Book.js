const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
	title: { type: String, required: true, trim: true },
	author: { type: String, required: true, trim: true },
	genre: { type: String, trim: true },
	description: String,
	price: { type: Number, required: true, min: 0 },
	image: String,
});

module.exports = mongoose.model('Book', bookSchema);
