const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Book = require('../models/Book');
const User = require('../models/User');
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

// GET /api/admin/stats?days=30 -> dashboard numbers (cancelled orders do not count as sales)
router.get('/stats', async (req, res, next) => {
	try {
		const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 365);
		const since = new Date();
		since.setUTCHours(0, 0, 0, 0);
		since.setUTCDate(since.getUTCDate() - (days - 1));
		const live = { status: { $ne: 'cancelled' } };
		const [totals, byDay, topBooks, statusAgg, lowStock, books, users, lowCount] = await Promise.all([
			Order.aggregate([{ $match: live }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
			Order.aggregate([
				{ $match: { ...live, createdAt: { $gte: since } } },
				{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
			]),
			Order.aggregate([
				{ $match: live },
				{ $unwind: '$items' },
				{ $group: { _id: '$items.book', title: { $last: '$items.title' }, units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
				{ $sort: { units: -1 } },
				{ $limit: 5 },
			]),
			Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
			Book.find({ stock: { $lte: 5 } }).sort({ stock: 1, title: 1 }).limit(10).select('title author stock'),
			Book.countDocuments(),
			User.countDocuments(),
			Book.countDocuments({ stock: { $lte: 5 } }),
		]);
		const map = new Map(byDay.map((d) => [d._id, d]));
		const salesByDay = [];
		for (let i = 0; i < days; i++) {
			const d = new Date(since);
			d.setUTCDate(d.getUTCDate() + i);
			const key = d.toISOString().slice(0, 10);
			const row = map.get(key);
			salesByDay.push({ date: key, revenue: Math.round((row?.revenue || 0) * 100) / 100, orders: row?.orders || 0 });
		}
		const statusCounts = Object.fromEntries(Order.schema.path('status').enumValues.map((s) => [s, 0]));
		for (const s of statusAgg) statusCounts[s._id || 'placed'] = s.n;
		res.json({
			totals: { revenue: Math.round((totals[0]?.revenue || 0) * 100) / 100, orders: totals[0]?.orders || 0, books, users, lowStock: lowCount },
			salesByDay,
			topBooks: topBooks.map((t) => ({ id: t._id, title: t.title, units: t.units, revenue: Math.round(t.revenue * 100) / 100 })),
			statusCounts,
			lowStock,
		});
	} catch (err) {
		next(err);
	}
});

module.exports = router;
