// Shared test setup. Every test file uses its own throwaway database named bk_test_*, dropped afterwards.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstore-uploads-'));
process.env.FRONTEND_URL = 'http://frontend.test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
delete process.env.STRIPE_SECRET_KEY; // never hit real Stripe; start on the mock path

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const { engine, buildContext, store } = require('../lib/engine');
const { ensureIndexes } = require('../lib/mongostore');
const catalog = require('../shared/catalog.json');
const classics = require('../shared/classics.json');

const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const dbName = `bk_test_${process.pid}_${Date.now().toString(36)}`;

async function connect() {
	await mongoose.connect(`${BASE.replace(/\/$/, '')}/${dbName}`);
	if (!mongoose.connection.name.startsWith('bk_')) throw new Error('Refusing to run tests on a database that is not named bk_*');
	await ensureIndexes();
}
async function cleanup() {
	if (mongoose.connection.name.startsWith('bk_')) await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
	fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
}
const ctx = () => buildContext(app);
const seed = (opts = {}) => engine.seedStore(ctx(), { catalog, classics, ...opts });

const api = () => request(app);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
async function login(email, password = 'Password123!') {
	const r = await api().post('/api/auth/login').send({ email, password });
	if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
	return { token: r.body.token, user: r.body.user, h: bearer(r.body.token) };
}
async function register(email, name = 'Tester', password = 'secret123') {
	const r = await api().post('/api/auth/register').send({ name, email, password });
	return { res: r, token: r.body.token, user: r.body.user, h: bearer(r.body.token) };
}
// Inserts a book through the store (like an import would) and returns it.
async function mkBook(over = {}) {
	const base = { title: 'Test Book', author: 'Test Author', genre: 'Fiction', language: 'English', description: '', excerpt: '', image: '', tags: [], series: null, sold: 0, rating: 0, numReviews: 0, publishedAt: new Date(Date.now() - 86400000 * 30).toISOString(), createdAt: new Date().toISOString() };
	const formats = over.formats || [{ type: 'paperback', price: over.price ?? 10.5, stock: over.stock ?? 50 }];
	const price = formats.find((f) => f.type === 'paperback')?.price ?? formats[0].price;
	const stock = formats.filter((f) => f.type === 'paperback' || f.type === 'hardcover').reduce((s, f) => s + (f.stock || 0), 0);
	const doc = { ...base, ...over, formats, price, stock };
	return store.insert('books', doc);
}
async function mkUser(email, role = 'user', extra = {}) {
	const hash = await ctx().hash('secret123');
	return store.insert('users', { name: email.split('@')[0], email, password: hash, role, tokenVersion: 0, points: 0, lifetimePoints: 0, country: 'US', readingList: [], goal: null, createdAt: new Date().toISOString(), ...extra });
}
async function tokenFor(email, password = 'secret123') {
	return login(email, password);
}

module.exports = { mongoose, request, app, api, bearer, connect, cleanup, seed, login, register, mkBook, mkUser, tokenFor, ctx, store, engine, catalog, classics, dbName };
