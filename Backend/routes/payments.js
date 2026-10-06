const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { priceCart } = require('../lib/pricing');
const { getStripe } = require('../lib/stripe');

const router = express.Router();
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Tells the frontend which payment path is active so it can label it honestly.
router.get('/config', (req, res) => res.json({ mode: getStripe(req.app) ? 'stripe' : 'mock' }));

// POST /api/payments/checkout  body: { items: [{book, qty}] }
// Stripe configured -> pending order + Checkout Session (test mode with sk_test_ keys); returns { mode:'stripe', url }.
// Not configured   -> MOCK path: order is created as 'paid (mock)'; returns { mode:'mock', order }.
router.post('/checkout', auth, async (req, res, next) => {
	try {
		const { lines, total } = await priceCart(req.body?.items);
		const stripe = getStripe(req.app);
		if (!stripe) {
			const order = await Order.create({ user: req.user._id, items: lines, total, paymentStatus: 'paid (mock)' });
			return res.status(201).json({ mode: 'mock', order });
		}
		const order = await Order.create({ user: req.user._id, items: lines, total, paymentStatus: 'pending (stripe)' });
		try {
			const session = await stripe.checkout.sessions.create({
				mode: 'payment',
				client_reference_id: String(order._id),
				customer_email: req.user.email,
				metadata: { orderId: String(order._id) },
				line_items: lines.map((l) => ({
					quantity: l.qty,
					price_data: {
						currency: process.env.STRIPE_CURRENCY || 'usd',
						unit_amount: Math.round(l.price * 100),
						product_data: { name: l.title },
					},
				})),
				success_url: `${frontendUrl()}/checkout/success?order=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: `${frontendUrl()}/checkout/cancel?order=${order._id}`,
			});
			order.stripeSessionId = session.id;
			await order.save();
			res.status(201).json({ mode: 'stripe', url: session.url, orderId: order._id });
		} catch (err) {
			await Order.deleteOne({ _id: order._id });
			throw err;
		}
	} catch (err) {
		next(err);
	}
});

// Mounted in app.js with express.raw() BEFORE express.json(): Stripe signature needs the raw body.
async function webhook(req, res) {
	const stripe = getStripe(req.app);
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!stripe || !secret) return res.status(503).json({ error: 'Stripe webhook is not configured' });
	let event;
	try {
		event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
	} catch {
		return res.status(400).json({ error: 'Invalid webhook signature' });
	}
	try {
		const session = event.data?.object;
		const orderId = session?.metadata?.orderId || session?.client_reference_id;
		if (orderId && event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
			await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: 'paid (stripe)' } });
		} else if (orderId && event.type === 'checkout.session.expired') {
			await Order.updateOne(
				{ _id: orderId, paymentStatus: 'pending (stripe)' },
				{ $set: { paymentStatus: 'expired (stripe)', status: 'cancelled' } }
			);
		}
		res.json({ received: true });
	} catch (err) {
		console.error('webhook handling failed', err);
		res.status(500).json({ error: 'Webhook handling failed' });
	}
}

module.exports = router;
module.exports.webhook = webhook;
