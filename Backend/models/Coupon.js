const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
	{
		code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
		description: { type: String, trim: true, maxlength: 200, default: '' },
		type: { type: String, enum: ['percent', 'fixed'], required: true },
		value: { type: Number, required: true, min: 0.01 },
		minSubtotal: { type: Number, default: 0, min: 0 },
		expiresAt: { type: Date, default: null },
		usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
		used: { type: Number, default: 0, min: 0 },
		active: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
