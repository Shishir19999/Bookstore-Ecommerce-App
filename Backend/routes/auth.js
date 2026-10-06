const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sign = (user) => jwt.sign({ id: user._id, tv: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });
const str = (v) => (typeof v === 'string' ? v.trim() : '');

router.post('/register', async (req, res, next) => {
	try {
		const name = str(req.body?.name);
		const email = str(req.body?.email).toLowerCase();
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (!name || name.length > 80) return res.status(400).json({ error: 'Name is required (max 80 chars)' });
		if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
		if (password.length < 6 || password.length > 72)
			return res.status(400).json({ error: 'Password must be 6-72 characters' });
		if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });

		// role is never taken from the request: self-registration always yields a normal user.
		const user = await User.create({ name, email, password, role: 'user' });
		res.status(201).json({ token: sign(user), user: publicUser(user) });
	} catch (err) {
		next(err);
	}
});

router.post('/login', async (req, res, next) => {
	try {
		const email = str(req.body?.email).toLowerCase();
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
		const user = await User.findOne({ email }).select('+password');
		if (!user || !(await user.matchPassword(password)))
			return res.status(401).json({ error: 'Invalid email or password' });
		res.json({ token: sign(user), user: publicUser(user) });
	} catch (err) {
		next(err);
	}
});

router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// Revokes every token issued so far for this user (all devices) by bumping tokenVersion.
router.post('/logout', auth, async (req, res, next) => {
	try {
		await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
		res.json({ message: 'Logged out; existing tokens revoked' });
	} catch (err) {
		next(err);
	}
});

module.exports = router;
