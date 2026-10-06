const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the JWT, that the user still exists, and that the token has not been revoked (tokenVersion).
module.exports = async function auth(req, res, next) {
	try {
		const header = req.headers.authorization || '';
		const token = header.startsWith('Bearer ') ? header.slice(7) : null;
		if (!token) return res.status(401).json({ error: 'Authentication required' });
		const payload = jwt.verify(token, process.env.JWT_SECRET);
		const user = await User.findById(payload.id);
		if (!user) return res.status(401).json({ error: 'User no longer exists' });
		if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0))
			return res.status(401).json({ error: 'Token has been revoked, please log in again' });
		req.user = user;
		next();
	} catch {
		res.status(401).json({ error: 'Invalid or expired token' });
	}
};
