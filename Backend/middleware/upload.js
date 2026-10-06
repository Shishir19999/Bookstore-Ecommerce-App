const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const MAX_BYTES = 2 * 1024 * 1024;

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		fs.mkdirSync(UPLOAD_DIR, { recursive: true });
		cb(null, UPLOAD_DIR);
	},
	// Random server-chosen name; extension derived from the validated mimetype, never the client name.
	filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[file.mimetype]),
});

const upload = multer({
	storage,
	limits: { fileSize: MAX_BYTES, files: 1 },
	fileFilter: (req, file, cb) => {
		if (!EXT[file.mimetype]) return cb(new Error('Cover must be a JPEG, PNG, WebP or GIF image'));
		cb(null, true);
	},
});

// Magic-byte check so a lying Content-Type is rejected.
function looksLikeImage(file) {
	const b = Buffer.alloc(12);
	const fd = fs.openSync(file.path, 'r');
	try {
		fs.readSync(fd, b, 0, 12, 0);
	} finally {
		fs.closeSync(fd);
	}
	const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
	const isPng = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	const isGif = b.subarray(0, 4).toString() === 'GIF8';
	const isWebp = b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
	return isJpg || isPng || isGif || isWebp;
}

// Wraps multer for the single "cover" field and converts its errors to 400 JSON.
function coverUpload(req, res, next) {
	upload.single('cover')(req, res, (err) => {
		if (err) {
			const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Cover image must be 2MB or smaller' : err.message;
			return res.status(400).json({ error: msg });
		}
		if (req.file && !looksLikeImage(req.file)) {
			fs.unlink(req.file.path, () => {});
			return res.status(400).json({ error: 'Uploaded file is not a valid image' });
		}
		next();
	});
}

const removeUploaded = (imageUrl) => {
	if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return;
	fs.unlink(path.join(UPLOAD_DIR, path.basename(imageUrl)), () => {});
};

module.exports = { coverUpload, removeUploaded, UPLOAD_DIR };
