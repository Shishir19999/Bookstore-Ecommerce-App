const mongoose = require('mongoose');

const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];

const orderSchema = new mongoose.Schema(
	{
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		items: [
			{
				book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
				title: String, // snapshot at purchase time
				price: Number, // snapshot at purchase time
				qty: { type: Number, required: true, min: 1 },
			},
		],
		total: { type: Number, required: true },
		// 'paid (mock)' = mock payment path (no provider); 'pending (stripe)' -> 'paid (stripe)' via webhook.
		paymentStatus: { type: String, default: 'paid (mock)' },
		stripeSessionId: { type: String, index: true, sparse: true },
		// Fulfilment status managed by admins.
		status: { type: String, enum: ORDER_STATUSES, default: 'placed' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
