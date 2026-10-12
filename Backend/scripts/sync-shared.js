// Copies Backend/shared (source of truth) to Frontend/src/shared so the live preview runs byte-identical rules.
//   node scripts/sync-shared.js          copy
//   node scripts/sync-shared.js --check  exit 1 if the copies differ (also enforced by a backend test)
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'shared');
const to = path.join(__dirname, '..', '..', 'Frontend', 'src', 'shared');

function diff() {
	const names = new Set([...fs.readdirSync(from), ...(fs.existsSync(to) ? fs.readdirSync(to) : [])]);
	const bad = [];
	for (const n of names) {
		const a = path.join(from, n);
		const b = path.join(to, n);
		if (!fs.existsSync(a) || !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))) bad.push(n);
	}
	return bad;
}

if (require.main === module) {
	if (process.argv.includes('--check')) {
		const bad = diff();
		if (bad.length) {
			console.error('Shared files differ: ' + bad.join(', ') + '. Run `npm run sync:shared` in Backend.');
			process.exit(1);
		}
		console.log('Shared rules are identical in Backend and Frontend.');
	} else {
		fs.mkdirSync(to, { recursive: true });
		for (const n of fs.readdirSync(from)) fs.copyFileSync(path.join(from, n), path.join(to, n));
		for (const n of fs.readdirSync(to)) if (!fs.existsSync(path.join(from, n))) fs.unlinkSync(path.join(to, n));
		console.log('Copied Backend/shared to Frontend/src/shared');
	}
}

module.exports = { diff, from, to };
