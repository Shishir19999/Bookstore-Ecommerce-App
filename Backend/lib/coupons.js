const Coupon = require('../models/Coupon');
const { HttpError } = require('./pricing');

const round2 = (n) => Math.round(n * 100) / 100;

// Pure check: returns { ok, discount, message } for a coupon document and a cart subtotal.
function evalCoupon(coupon, subtotal, now = new Date()) {
	if (!coupon || !coupon.active) return { ok: false, discount: 0, message: 'Invalid coupon code' };
	if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return { ok: false, discount: 0, message: 'This coupon has expired' };
	if (coupon.usageLimit && coupon.used >= coupon.usageLimit) return { ok: false, discount: 0, message: 'This coupon has been fully redeemed' };
	if (subtotal < (coupon.minSubtotal || 0))
		return { ok: false, discount: 0, message: `Spend at least $${Number(coupon.minSubtotal).toFixed(2)} to use this coupon` };
	const raw = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
	return { ok: true, discount: round2(Math.min(subtotal, raw)), message: 'Coupon applied' };
}

// Looks a code up and validates it against the server-computed subtotal. Throws 400 when it cannot be used.
async function resolveCoupon(code, subtotal) {
	if (code === undefined || code === null || code === '') return { coupon: null, discount: 0 };
	if (typeof code !== 'string' || code.length > 30) throw new HttpError(400, 'Invalid coupon code');
	const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
	const r = evalCoupon(coupon, subtotal);
	if (!r.ok) throw new HttpError(400, r.message);
	return { coupon, discount: r.discount, message: r.message };
}

// Counts a redemption; false when the usage limit was reached in the meantime.
async function redeem(coupon) {
	if (!coupon) return true;
	const filter = coupon.usageLimit ? { _id: coupon._id, used: { $lt: coupon.usageLimit } } : { _id: coupon._id };
	return (await Coupon.updateOne(filter, { $inc: { used: 1 } })).modifiedCount === 1;
}

const unredeem = (coupon) => (coupon ? Coupon.updateOne({ _id: coupon._id, used: { $gt: 0 } }, { $inc: { used: -1 } }) : null);

const unredeemByCode = (code) => (code ? Coupon.updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } }) : null);

module.exports = { unredeemByCode, evalCoupon, resolveCoupon, redeem, unredeem, round2 };
