const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { priceCart } = require('../lib/pricing');
const { getStripe } = require('../lib/stripe');

const router = express.Router();

// POST /api/orders  body: { items: [{ book: <id>, qty: <int> }] }  -- MOCK payment order creation.
// Disabled when Stripe is configured so payment cannot be bypassed (use POST /api/payments/checkout).
router.post('/', auth, async (req, res, next) => {
	try {
		if (getStripe(req.app)) return res.status(403).json({ error: 'Mock orders are disabled; use /api/payments/checkout' });
		const { lines, total } = await priceCart(req.body?.items);
		const order = await Order.create({ user: req.user._id, items: lines, total });
		res.status(201).json(order);
	} catch (err) {
		next(err);
	}
});

router.get('/mine', auth, async (req, res, next) => {
	try {
		res.json(await Order.find({ user: req.user._id }).sort({ createdAt: -1 }));
	} catch (err) {
		next(err);
	}
});

module.exports = router;
