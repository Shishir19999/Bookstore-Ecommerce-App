// Must run after the auth middleware.
module.exports = function admin(req, res, next) {
	if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
	next();
};
