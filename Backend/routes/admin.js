const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { ORDER_STATUSES } = require('../models/Order');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();
router.use(auth, admin);

// GET /api/admin/orders?page=&limit=&status=
router.get('/orders', async (req, res, next) => {
	try {
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
		const filter = {};
		if (typeof req.query.status === 'string' && ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
		const [orders, total] = await Promise.all([
			Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email'),
			Order.countDocuments(filter),
		]);
		res.json({ orders, page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
	} catch (err) {
		next(err);
	}
});

// PATCH /api/admin/orders/:id/status  body: { status }
router.patch('/orders/:id/status', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid order id' });
		const status = req.body?.status;
		if (!ORDER_STATUSES.includes(status))
			return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
		const order = await Order.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' }).populate('user', 'name email');
		if (!order) return res.status(404).json({ error: 'Order not found' });
		res.json(order);
	} catch (err) {
		next(err);
	}
});

module.exports = router;
