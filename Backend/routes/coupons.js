const express = require('express');
const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { priceCart, HttpError } = require('../lib/pricing');
const { resolveCoupon } = require('../lib/coupons');

// Shopper-facing: POST /api/coupons/validate  { code, items } -> discount for the current cart (nothing is redeemed).
const shopper = express.Router();
shopper.post('/validate', auth, async (req, res, next) => {
	try {
		if (typeof req.body?.code !== 'string' || !req.body.code.trim()) throw new HttpError(400, 'Enter a coupon code');
		const { total } = await priceCart(req.body.items);
		const { coupon, discount, message } = await resolveCoupon(req.body.code, total);
		res.json({ message, discount, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description } });
	} catch (err) {
		next(err);
	}
});

// Admin CRUD: /api/admin/coupons
const adminRouter = express.Router();
adminRouter.use(auth, admin);

function parse(body, partial) {
	const d = {};
	if (body.code !== undefined || !partial) {
		const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
		if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpError(400, 'code must be 3-30 letters, digits, - or _');
		d.code = code;
	}
	if (body.type !== undefined || !partial) {
		if (!['percent', 'fixed'].includes(body.type)) throw new HttpError(400, 'type must be percent or fixed');
		d.type = body.type;
	}
	if (body.value !== undefined || !partial) {
		const v = Number(body.value);
		if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new HttpError(400, 'value must be a positive number');
		d.value = v;
	}
	const type = d.type ?? body.type;
	if (type === 'percent' && d.value !== undefined && d.value > 100) throw new HttpError(400, 'A percent coupon cannot exceed 100');
	for (const k of ['minSubtotal', 'usageLimit']) {
		if (body[k] === undefined || body[k] === '') continue;
		const n = Number(body[k]);
		if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} must be zero or more`);
		d[k] = k === 'usageLimit' ? Math.floor(n) : n;
	}
	if (body.expiresAt !== undefined) {
		if (body.expiresAt === null || body.expiresAt === '') d.expiresAt = null;
		else {
			const t = new Date(body.expiresAt);
			if (Number.isNaN(t.getTime())) throw new HttpError(400, 'expiresAt must be a valid date');
			d.expiresAt = t;
		}
	}
	if (body.description !== undefined) {
		if (typeof body.description !== 'string' || body.description.length > 200) throw new HttpError(400, 'description must be at most 200 characters');
		d.description = body.description.trim();
	}
	if (body.active !== undefined) d.active = !!body.active;
	return d;
}

const dup = (err) => (err.code === 11000 ? new HttpError(409, 'A coupon with this code already exists') : err);

adminRouter.get('/', async (req, res, next) => {
	try {
		res.json(await Coupon.find().sort({ createdAt: -1 }));
	} catch (err) {
		next(err);
	}
});
adminRouter.post('/', async (req, res, next) => {
	try {
		res.status(201).json(await Coupon.create(parse(req.body || {}, false)));
	} catch (err) {
		next(dup(err));
	}
});
adminRouter.put('/:id', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid coupon id');
		const coupon = await Coupon.findById(req.params.id);
		if (!coupon) throw new HttpError(404, 'Coupon not found');
		const d = parse(req.body || {}, true);
		if ((d.type ?? coupon.type) === 'percent' && (d.value ?? coupon.value) > 100) throw new HttpError(400, 'A percent coupon cannot exceed 100');
		coupon.set(d);
		res.json(await coupon.save());
	} catch (err) {
		next(dup(err));
	}
});
adminRouter.delete('/:id', async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid coupon id');
		const c = await Coupon.findByIdAndDelete(req.params.id);
		if (!c) throw new HttpError(404, 'Coupon not found');
		res.json({ deleted: true, id: c._id });
	} catch (err) {
		next(err);
	}
});

module.exports = shopper;
module.exports.admin = adminRouter;
