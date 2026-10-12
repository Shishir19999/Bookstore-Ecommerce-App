// Express app (no DB connection / listen here so tests can import it).
// Every /api route is implemented once in shared/engine.mjs and served here through a thin adapter, so the browser-only
// live preview (which runs the same engine over localStorage) offers exactly the same features.
const express = require('express');
const cors = require('cors');
const { UPLOAD_DIR, coverUpload, removeUploaded } = require('./middleware/upload');
const { engine, buildContext } = require('./lib/engine');
const { getStripe } = require('./lib/stripe');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use((req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('Referrer-Policy', 'no-referrer');
	next();
});

// Stripe webhook needs the raw body for signature verification, so it is mounted before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
		await engine.stripeEvent(buildContext(req.app), event);
		res.json({ received: true });
	} catch (err) {
		console.error('webhook handling failed', err);
		res.status(500).json({ error: 'Webhook handling failed' });
	}
});

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin') }));

const bearer = (req) => {
	const h = req.headers.authorization || '';
	return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// Cover uploads: authenticate as staff first, then let multer store the file (never for anonymous callers).
app.use('/api/books', async (req, res, next) => {
	const multipart = /multipart\/form-data/i.test(req.headers['content-type'] || '');
	const write = (req.method === 'POST' && req.path === '/') || (req.method === 'PUT' && /^\/[^/]+\/?$/.test(req.path));
	if (!multipart || !write) return next();
	try {
		const user = await engine.authenticate(buildContext(req.app), bearer(req));
		if (!['staff', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Staff access required' });
	} catch (e) {
		return res.status(e.status || 401).json({ error: e.message });
	}
	coverUpload(req, res, next);
});

app.use('/api', async (req, res, next) => {
	const upload = req.file ? `/uploads/${req.file.filename}` : null;
	const cleanup = () => upload && removeUploaded(upload);
	try {
		const body = { ...(req.body || {}) };
		if (upload) body.__cover = upload;
		const out = await engine.handle(buildContext(req.app), { method: req.method, path: req.originalUrl.split('?')[0], query: req.query, body, token: bearer(req), cleanup });
		if (out.data && out.data.__csv) {
			res.status(out.status).type('text/csv').set('Content-Disposition', `attachment; filename="${out.data.filename}"`).send(out.data.text);
			return;
		}
		res.status(out.status).json(out.data);
	} catch (err) {
		cleanup();
		next(err);
	}
});

// JSON error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
	if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
	if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
	if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
	console.error(err);
	res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
