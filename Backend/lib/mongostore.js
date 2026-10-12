// MongoDB adapter for the shared engine's store interface (see shared/memstore.mjs for the reference behaviour).
// Documents are plain objects; references are stored as ObjectIds and surfaced to the engine as hex strings.
const mongoose = require('mongoose');

const { ObjectId } = mongoose.mongo;
const HEX = /^[0-9a-f]{24}$/;
// Keys whose string values (24 hex chars) are ids and must be stored as ObjectIds.
const REF = new Set(['_id', 'book', 'user', 'owner', 'club', 'thread', 'order', 'bundle', 'purchaser', 'card', 'by', 'members', 'bookIds', 'helpful', 'reporters', 'rsvps']);
const last = (k) => (typeof k === 'string' ? k.split('.').pop() : k);

function toDb(v, key) {
	if (typeof v === 'string') return REF.has(last(key)) && HEX.test(v) ? new ObjectId(v) : v;
	if (Array.isArray(v)) return v.map((x) => toDb(x, key));
	if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof ObjectId)) {
		const out = {};
		for (const [k, x] of Object.entries(v)) {
			if (x === undefined) continue;
			out[k] = toDb(x, k.startsWith('$') ? key : k);
		}
		return out;
	}
	return v;
}

function fromDb(v) {
	if (v instanceof ObjectId) return v.toHexString();
	if (v instanceof Date) return v.toISOString();
	if (Array.isArray(v)) return v.map(fromDb);
	if (v && typeof v === 'object') {
		const out = {};
		for (const [k, x] of Object.entries(v)) out[k] = fromDb(x);
		return out;
	}
	return v;
}

function createMongoStore(getDb = () => mongoose.connection.db) {
	const c = (name) => getDb().collection(name);
	return {
		async find(name, filter = {}, { sort, limit, skip } = {}) {
			let cur = c(name).find(toDb(filter));
			if (sort) cur = cur.sort(sort);
			if (skip) cur = cur.skip(skip);
			if (limit) cur = cur.limit(limit);
			return (await cur.toArray()).map(fromDb);
		},
		async get(name, id) {
			return fromDb(await c(name).findOne({ _id: toDb(String(id), '_id') }));
		},
		async one(name, filter) {
			return fromDb(await c(name).findOne(toDb(filter)));
		},
		count: (name, filter = {}) => c(name).countDocuments(toDb(filter)),
		async insert(name, doc) {
			const row = toDb({ ...doc });
			if (!row._id) row._id = new ObjectId();
			await c(name).insertOne(row);
			return fromDb(row);
		},
		async insertMany(name, docs) {
			if (!docs.length) return 0;
			const rows = docs.map((d) => ({ ...toDb(d), _id: d._id ? toDb(String(d._id), '_id') : new ObjectId() }));
			await c(name).insertMany(rows);
			return rows.length;
		},
		async update(name, id, patch, unset = []) {
			const ops = { $set: toDb(patch) };
			if (unset.length) ops.$unset = Object.fromEntries(unset.map((k) => [k, '']));
			return fromDb(await c(name).findOneAndUpdate({ _id: toDb(String(id), '_id') }, ops, { returnDocument: 'after' }));
		},
		async atomic(name, filter, ops) {
			return (await c(name).updateOne(toDb(filter), toDb(ops))).matchedCount;
		},
		async remove(name, id) {
			return (await c(name).deleteOne({ _id: toDb(String(id), '_id') })).deletedCount === 1;
		},
		async removeWhere(name, filter) {
			return (await c(name).deleteMany(toDb(filter))).deletedCount;
		},
	};
}

// Unique and lookup indexes. Failures (for example duplicates in a pre-existing database) are reported, not fatal.
async function ensureIndexes(db = mongoose.connection.db) {
	const specs = [
		['users', { email: 1 }, { unique: true }],
		['books', { slug: 1 }, {}],
		['books', { author: 1 }, {}],
		['reviews', { book: 1, user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }],
		['giftcards', { code: 1 }, { unique: true }],
		['coupons', { code: 1 }, { unique: true }],
		['collections', { slug: 1 }, { unique: true }],
		['bundles', { slug: 1 }, { unique: true }],
		['clubs', { nameKey: 1 }, { unique: true }],
		['activity', { user: 1, date: 1 }, { unique: true }],
		['readerStates', { user: 1, book: 1 }, { unique: true }],
		['follows', { user: 1, author: 1 }, { unique: true }],
		['stockAlerts', { user: 1, book: 1, format: 1 }, { unique: true }],
		['orders', { user: 1, createdAt: -1 }, {}],
		['notifications', { user: 1, createdAt: -1 }, {}],
		['posts', { thread: 1, createdAt: 1 }, {}],
	];
	for (const [coll, keys, opts] of specs) {
		try {
			await db.collection(coll).createIndex(keys, opts);
		} catch (err) {
			console.warn(`Could not create index on ${coll}: ${err.message}`);
		}
	}
}

module.exports = { createMongoStore, ensureIndexes, toDb, fromDb };
