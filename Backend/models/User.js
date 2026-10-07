const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		password: { type: String, required: true, select: false },
		role: { type: String, enum: ['user', 'admin'], default: 'user' },
		// Bumped on logout; JWTs carry the value they were issued with and are rejected when stale.
		tokenVersion: { type: Number, default: 0 },
		// Reading list / wishlist with a status per book.
		readingList: [
			{
				_id: false,
				book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
				status: { type: String, enum: ['want', 'reading', 'finished'], default: 'want' },
				addedAt: { type: Date, default: Date.now },
			},
		],
	},
	{ timestamps: true }
);

userSchema.pre('save', async function () {
	if (!this.isModified('password')) return;
	this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (plain) {
	return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
