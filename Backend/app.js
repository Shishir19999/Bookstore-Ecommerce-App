// Express app (no DB connection / listen here so tests can import it).
const express = require('express');
const cors = require('cors');
const { UPLOAD_DIR } = require('./middleware/upload');

const app = express();

app.use(cors());

// Stripe webhook needs the raw body for signature verification, so it is mounted before express.json().
const payments = require('./routes/payments');
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), payments.webhook);

app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR, { setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin') }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', payments);
app.use('/api/me', require('./routes/me'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/admin/coupons', require('./routes/coupons').admin);
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// JSON error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
	if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
	if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
	console.error(err);
	res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
