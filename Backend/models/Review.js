const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
	{
		book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
		// Optional so sample reviews can exist without an account; real reviews always carry the user.
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		name: { type: String, required: true, trim: true, maxlength: 80 },
		rating: { type: Number, required: true, min: 1, max: 5 },
		text: { type: String, trim: true, maxlength: 1000, default: '' },
	},
	{ timestamps: true }
);

// One review per user per book (sample reviews without a user are exempt).
reviewSchema.index({ book: 1, user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } });

module.exports = mongoose.model('Review', reviewSchema);
