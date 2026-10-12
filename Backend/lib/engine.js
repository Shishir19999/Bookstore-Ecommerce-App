// Loads the shared ESM engine from CommonJS and builds the per-app context (storage, hashing, tokens, Stripe, realtime).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const engine = require('../shared/engine.mjs');
const { createMongoStore } = require('./mongostore');
const { removeUploaded } = require('../middleware/upload');
const { getStripe } = require('./stripe');

const secureRandom = () => crypto.randomInt(0, 2 ** 31) / 2 ** 31;
const store = createMongoStore();

// Builds the engine context. `app` provides hooks: app.get('stripe'), app.get('now'), app.get('fetch'), app.get('io').
function buildContext(app) {
	const nowFn = app?.get('now');
	const fetchFn = app?.get('fetch');
	return {
		mode: 'real',
		store,
		now: () => (nowFn ? nowFn() : new Date().toISOString()),
		newId: () => new mongoose.mongo.ObjectId().toHexString(),
		random: secureRandom,
		hash: (pw) => bcrypt.hash(pw, 10),
		verify: (pw, hash) => bcrypt.compare(pw, hash),
		signToken: (user) => jwt.sign({ id: String(user._id), tv: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d' }),
		verifyToken: (token) => jwt.verify(token, process.env.JWT_SECRET),
		fetch: fetchFn || ((...a) => fetch(...a)),
		loadClassics: async () => require('../shared/classics.json'),
		removeUpload: removeUploaded,
		emit: (room, event, payload) => app?.get('io')?.to(room).emit(event, payload),
		payments: {
			label: 'mock',
			mode: () => (getStripe(app) ? 'stripe' : 'mock'),
			createSession: (input) => createStripeSession(app, input),
		},
	};
}

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

async function createStripeSession(app, { order, lines, totals, user }) {
	const stripe = getStripe(app);
	const currency = process.env.STRIPE_CURRENCY || 'usd';
	const money = (n) => Math.round(n * 100);
	const line_items = lines.map((l) => ({
		quantity: l.qty,
		price_data: { currency, unit_amount: money(l.price), product_data: { name: l.kind === 'giftcard' ? 'Gift card' : `${l.title}${l.format ? ` (${l.format})` : ''}` } },
	}));
	for (const [name, amount] of [['Shipping', totals.shipping], ['Gift wrapping', totals.giftWrap], ['Estimated tax', totals.tax]]) {
		if (amount > 0) line_items.push({ quantity: 1, price_data: { currency, unit_amount: money(amount), product_data: { name } } });
	}
	const off = totals.bundleDiscount + totals.couponDiscount + totals.pointsDiscount + totals.giftCardApplied;
	const discounts = off > 0 ? [{ coupon: (await stripe.coupons.create({ amount_off: money(off), currency, duration: 'once' })).id }] : undefined;
	return stripe.checkout.sessions.create({
		mode: 'payment',
		discounts,
		client_reference_id: String(order._id),
		customer_email: user.email,
		metadata: { orderId: String(order._id) },
		line_items,
		success_url: `${frontendUrl()}/checkout/success?order=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${frontendUrl()}/checkout/cancel?order=${order._id}`,
	});
}

module.exports = { engine, store, buildContext };
