const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const { priceCart, reserveStock, releaseStock, cleanShipping, HttpError } = require('../lib/pricing');
const { resolveCoupon, redeem, round2 } = require('../lib/coupons');
const { getStripe } = require('../lib/stripe');

const router = express.Router();

// POST /api/orders  body: { items: [{ book: <id>, qty: <int> }] }  -- MOCK payment order creation.
// Disabled when Stripe is configured so payment cannot be bypassed (use POST /api/payments/checkout).
router.post('/', auth, async (req, res, next) => {
	try {
		if (getStripe(req.app)) return res.status(403).json({ error: 'Mock orders are disabled; use /api/payments/checkout' });
		const { lines, total: subtotal } = await priceCart(req.body?.items);
		const { coupon, discount } = await resolveCoupon(req.body?.couponCode, subtotal);
		await reserveStock(lines);
		if (!(await redeem(coupon))) {
			await releaseStock(lines);
			throw new HttpError(400, 'This coupon has been fully redeemed');
		}
		const order = await Order.create({
			user: req.user._id,
			items: lines,
			subtotal,
			discount,
			couponCode: coupon?.code,
			total: round2(subtotal - discount),
			shipping: cleanShipping(req.body?.shipping),
		});
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

// POST /api/orders/:id/reorder  -> the books of a past order that still exist, with their CURRENT price/stock,
// ready to be put back in the cart. Nothing is charged or created here.
router.post('/:id/reorder', auth, async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid order id');
		const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
		if (!order) throw new HttpError(404, 'Order not found');
		const books = await Book.find({ _id: { $in: order.items.map((i) => i.book) } });
		const byId = new Map(books.map((b) => [String(b._id), b]));
		const items = [];
		const unavailable = [];
		for (const it of order.items) {
			const b = byId.get(String(it.book));
			if (!b || b.stock < 1) unavailable.push(it.title);
			else items.push({ _id: b._id, title: b.title, price: b.price, image: b.image, qty: Math.min(it.qty, b.stock, 20) });
		}
		res.json({ items, unavailable });
	} catch (err) {
		next(err);
	}
});

module.exports = router;
