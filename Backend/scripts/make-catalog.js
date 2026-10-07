// Builds the sample catalog (fictional titles, authors and text) used by the seed script, the auto-seed on an
// empty database and the browser demo. Deterministic: running it twice yields identical files.
//   node scripts/make-catalog.js
const fs = require('fs');
const path = require('path');

const REF = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 86400000;

// title | author | language | one-line hook
const RAW = {
	Fantasy: [
		'The Lantern of Orrin Vale|Maren Ashdown|English|A lamplighter\'s apprentice discovers that every lantern in her city burns with a borrowed memory.',
		'Crown of Salt and Thorn|Maren Ashdown|English|Two rival heirs share one throne and one curse, and neither can leave the sea-cliff keep alone.',
		'The Cartographer\'s Dragon|Idris Wolfe|English|A mapmaker is hired to chart a mountain that moves whenever nobody is looking.',
		'Ember Court|Idris Wolfe|English|In a palace built inside a sleeping volcano, a cupbearer learns the court\'s oldest secret is still warm.',
		'La Sombra del Cuervo Blanco|Lucía Marén|Spanish|Una joven herborista cruza el bosque prohibido para devolver un nombre robado a su dueño.',
		'The Hollow Oak Chronicles|Tamsin Reeve|English|Four siblings inherit a tree whose door opens onto a different season every night.',
	],
	'Science Fiction': [
		'Orbit of Quiet Machines|Anselm Kade|English|Aboard a failing station, the maintenance mind must decide which of the crew to keep awake.',
		'The Tidewater Protocol|Priya Nandakumar|English|When the oceans of a colony world begin sending messages, a linguist has nine days to answer.',
		'Last Signal from Kepler Road|Anselm Kade|English|A long-haul courier hears her own voice on a frequency that has been silent for forty years.',
		'Glass Horizon|Priya Nandakumar|English|A terraforming engineer finds that the new sky is hiding something older than the planet.',
		'Les Jardins de Mars|Étienne Vasseur|French|Dans une colonie de serres, un botaniste découvre que les plantes se souviennent de tout.',
		'Seventeen Minutes of Daylight|Noor Haddad|English|On a tidally locked world, a surveyor races the edge of the night to reach a lost expedition.',
	],
	Mystery: [
		'The Clockmaker\'s Alibi|Harriet Lowell|English|Every clock in the village stopped at 9:42, and only one man admits he was not looking.',
		'Murder at Lantern Pier|Harriet Lowell|English|A seaside carnival, a missing mask and a detective who is afraid of Ferris wheels.',
		'A Quiet Inquest|Oswin Brandt|English|A retired coroner reopens the one case she signed off too quickly.',
		'Der Schatten im Archiv|Katarina Lenz|German|Eine Archivarin findet einen Brief, der einen längst gelösten Mordfall neu aufrollt.',
		'The Ninth Guest|Oswin Brandt|English|Eight invitations were sent. Nine people sat down to dinner.',
		'Salt Marsh Ledger|Harriet Lowell|English|An auditor follows a trail of doctored tide tables to a crime nobody wanted found.',
	],
	Romance: [
		'Letters to the Lighthouse Keeper|Clara Whitmore|English|Two strangers trade letters through a stormy winter without ever learning each other\'s names.',
		'The Spring We Almost Missed|Clara Whitmore|English|A baker and a bridge inspector keep meeting at the wrong moment, until the bridge closes.',
		'Second Chances at Maple Row|Dana Okafor|English|A returning pastry chef opens a shop across from the man who once wrote her the perfect apology.',
		'Monsoon Hearts|Ishani Rao|English|In rain-soaked Mumbai, a late-night radio host gains a listener who seems to know her too well.',
		'Tea for Two Time Zones|Dana Okafor|English|A long-distance friendship with a translator slowly becomes the closest thing to romance either has known.',
		'Ek Shaam Barish Ki|Ishani Rao|Hindi|बारिश की एक शाम, दो अजनबी और एक अधूरी चिट्ठी जो मंज़िल तक कभी नहीं पहुँची।',
	],
	'Historical Fiction': [
		'The Cartwright\'s Daughter|Edmund Hale|English|In 1840s Lancashire a mill-town girl teaches herself engineering and quietly redesigns the loom.',
		'Winter at Ravenscar Hall|Edmund Hale|English|A household of servants keeps a duchess\'s secret through the coldest winter on record.',
		'The Silk Road Cipher|Layla Farouk|English|A merchant\'s widow decodes her husband\'s ledgers to follow his final caravan.',
		'Bells of Old Lisbon|Tomás Valente|English|The great earthquake of 1755 seen through the eyes of a bell-founder\'s family.',
		'Salt Roads of the Hanse|Layla Farouk|English|A cog captain and a rune-carver compete for trading rights on the Baltic.',
		'Embers of the Paper Palace|Mei-Lin Chao|English|A court archivist works to save a library in the last days of a dynasty.',
	],
	'Science & Nature': [
		'The Hidden Life of Tide Pools|Rosalind Pryce|English|A friendly tour of the smallest and toughest ecosystems on the coast.',
		'Why Stars Twinkle|Rosalind Pryce|English|An accessible guide to light, air and the questions children ask about the night sky.',
		'Forest Under Our Feet|Jonas Ekberg|English|How fungal networks share water, food and warnings across a woodland.',
		'A Brief Atlas of Weather|Jonas Ekberg|English|Maps, myths and measurements of the forces that decide whether you need an umbrella.',
		'The Octopus Notebook|Rosalind Pryce|English|A field journal on intelligence in the most unexpected of animals.',
		'Deep Time Walks|Noor Haddad|English|Ten hikes where the rocks themselves tell the story of the planet\'s past.',
	],
	Technology: [
		'Pragmatic APIs|Samir Bhatt|English|Designing HTTP interfaces that stay understandable for a decade.',
		'The Humane Interface Handbook|Joanna Kessler|English|Practical design rules for accessible, forgiving software.',
		'Building with React Hooks|Samir Bhatt|English|A project-driven path from your first component to a production application.',
		'Databases in Plain Language|Joanna Kessler|English|Indexes, transactions and replication explained without the jargon.',
		'Shipping Small, Shipping Often|Marcus Delaney|English|How small teams release continuously without breaking things.',
		'The Quiet Art of Refactoring|Marcus Delaney|English|Safe, incremental changes that turn tangled code into something readable.',
	],
	Poetry: [
		'Paper Boats in the Gutter|Wren Alvarado|English|Poems about childhood summers and the rain that always ends them.',
		'Salt, Ink, Ash|Wren Alvarado|English|Short lyrics on grief and the stubborn things that grow afterward.',
		'Lunas de Vidrio|Lucía Marén|Spanish|Poemas breves sobre ciudades, insomnio y luz de luna.',
		'Small Hours|Tamsin Reeve|English|Quiet poems written between midnight and dawn.',
		'The Weight of Feathers|Tamsin Reeve|English|A debut collection about migration and belonging.',
		'Seasons of the Kite|Aarav Menon|English|Haiku-inspired verses on a year of flying kites from a rooftop.',
	],
};

// A second shelf per genre so the catalogue has 60+ titles.
const EXTRA = {
	Fantasy: [
		'The Thirteenth Bell of Hollin|Tamsin Reeve|English|When the thirteenth bell rings for the first time, a ferryman must carry its echo across the river.',
		'Wardens of the Ashen Road|Idris Wolfe|English|A caravan guard and a runaway scribe cross a kingdom that rewrites its borders overnight.',
	],
	'Science Fiction': [
		'The Long Quiet Between Stars|Noor Haddad|English|A generation ship’s archivist uncovers the one decision its founders chose to forget.',
		'Cities of Borrowed Light|Étienne Vasseur|French|Dans une métropole orbitale, une électricienne suit un courant qui n’appartient à personne.',
	],
	Mystery: [
		'The Lamplighter’s Ledger|Katarina Lenz|German|Ein Buchhalter bemerkt, dass jede Straßenlaterne der Stadt nach einem Todesfall gewartet wurde.',
		'Tea at the Quarry House|Oswin Brandt|English|A long weekend, six guests and one stopped pocket watch at the edge of the quarry.',
	],
	Romance: [
		'The Bookbinder’s Promise|Dana Okafor|English|A restorer finds a pressed flower in an old atlas and sets out to find who left it.',
		'Under the Same Umbrella|Ishani Rao|English|Two commuters share a single umbrella every monsoon morning and one unspoken rule.',
	],
	'Historical Fiction': [
		'The Salt Road to Aldmere|Edmund Hale|English|In 1370 a young clerk follows a salt merchant’s ledgers across a country recovering from plague.',
		'Lamps over the Canal|Marguerite Dufour|French|Dans l’Amsterdam du XVIIe siècle, une graveuse cache un secret dans chaque planche.',
	],
	'Science & Nature': [
		'A Field Guide to Quiet Places|Dr. Leena Varma|English|How to listen to a forest, a tide pool and a city park, and what each one is telling you.',
		'The Weather Inside a Cloud|Dr. Leena Varma|English|The physics of clouds, explained through one afternoon and a very patient kettle.',
	],
	Technology: [
		'Testing Without Tears|Joanna Kessler|English|A calm, practical guide to writing tests that save time instead of costing it.',
		'Observability for Small Teams|Samir Bhatt|English|Logs, metrics and traces you can actually afford to run and understand.',
	],
	Poetry: [
		'Ten Windows, One Street|Aarav Menon|English|Linked poems about the lives behind ten lit windows on a single evening.',
		'Cartas desde el Tren|Lucía Marén|Spanish|Cartas en verso escritas entre estaciones, para alguien que quizá nunca las lea.',
	],
};
for (const g of Object.keys(EXTRA)) RAW[g].push(...EXTRA[g]);

const GENRE_BLURB = {
	Fantasy: 'Quests, courts and quietly impossible doors.',
	'Science Fiction': 'Strange worlds, patient machines, honest questions.',
	Mystery: 'Cold cases, warm tea and one missing clue.',
	Romance: 'Slow-burn stories for rainy afternoons.',
	'Historical Fiction': 'Other centuries, vividly lived in.',
	'Science & Nature': 'Curious minds, clear explanations.',
	Technology: 'Practical craft for people who build software.',
	Poetry: 'Short, honest lines worth rereading.',
};

const SENTENCE = {
	Fantasy: 'A richly imagined adventure with a warm heart and a map worth studying.',
	'Science Fiction': 'Thoughtful, character-led science fiction with ideas that linger long after the last page.',
	Mystery: 'A carefully plotted puzzle that plays fair with the reader and keeps the tension steady.',
	Romance: 'A tender, witty love story about timing, courage and the people who wait for us.',
	'Historical Fiction': 'Meticulously researched and warmly told, with a setting you can almost smell.',
	'Science & Nature': 'Clear, vivid explanations for curious readers of any background.',
	Technology: 'Hands-on, example-driven advice from people who have shipped real systems.',
	Poetry: 'Spare, musical and easy to carry in a coat pocket.',
};

const NAMES = ['Wren', 'Corin', 'Ila', 'Teodor', 'Marit', 'Quill', 'Soren', 'Anya', 'Bram', 'Nell'];
const PLACES = ['the harbour district', 'the old observatory', 'Hollin Ridge', 'the lower market', 'the salt flats', 'Marrow Street', 'the north terminal', 'the river gate'];

const EXCERPT = {
	Fantasy: [
		'{n} counted the stairs the way {n} always did, because the tower had never once given the same number twice. Sixty-one tonight. Somewhere above, a door that had been locked for a hundred years was quietly deciding to open.\n\n"You are late," said the voice on the landing, and it did not sound like anyone who had ever been early. Below, {p} was beginning to glow.',
	],
	'Science Fiction': [
		'The first thing {n} noticed was that the corridor lights were pretending to be morning. The second was that nobody had authorised it.\n\n"Status," {n} said, and the station answered, politely, with a question of its own. Outside the viewport, {p} was exactly where it should not have been.',
	],
	Mystery: [
		'It was the kind of rain that makes witnesses forgetful. {n} stood under the awning near {p} and read the note again: four lines, no signature, and a spelling mistake that no educated person would make by accident.\n\nThat, more than the body, was what bothered {n}. People who lie about who they are rarely lie about how they spell.',
	],
	Romance: [
		'{n} had rehearsed the conversation on the whole walk to {p}, and then the door opened and every sentence left at once. "I was just passing," {n} said, which was false, and both of them knew it.\n\nHe smiled the way people do when they have decided to be kind about a small lie. "Then you will want to come in out of the weather."',
	],
	'Historical Fiction': [
		'By the time the bells rang over {p}, {n} had already hidden the ledger under the third floorboard from the window. It was not much of a hiding place, but it was the only one the house had left.\n\nOutside, carts were rolling past in the grey light, and everyone in the street pretended not to listen.',
	],
	'Science & Nature': [
		'Walk to {p} at low tide and look down. Within a single step there are more lives going on than in a whole city block, and nearly all of them are busy doing something clever.\n\nThis chapter begins with a simple question: how does anything survive somewhere that is flooded twice a day and baked in between?',
	],
	Technology: [
		'Every system you will ever maintain was once someone\'s clean idea. The trouble starts a year later, when {p} adds a requirement that nobody planned for.\n\nIn this chapter we look at one small habit that keeps code flexible when requirements change: write the test that describes the behaviour before you touch the structure.',
	],
	Poetry: [
		'Morning arrives in the kitchen first,\nthe kettle clearing its throat,\nthe window wearing yesterday\'s rain\nlike a coat it forgot to return.\n\nSomewhere near {p}\nsomeone is learning to whistle\nand getting it wrong\nin exactly the right key.',
	],
};

const REVIEW = {
	5: ['Could not put it down. Finished it in two sittings.', 'Beautifully written, and the ending stayed with me for days.', 'A real treat; I have already recommended it to three friends.', 'Exactly what I was hoping for and then some.'],
	4: ['Very good, with a couple of slow patches in the middle.', 'Smart and enjoyable. I would happily read more by this author.', 'Solid and well paced, and the characters feel real.', 'Great value and a lovely edition.'],
	3: ['Decent read, though it did not fully land for me.', 'Some lovely passages, some forgettable ones.', 'Fine for a weekend, but not a favourite.'],
};
const REVIEWERS = ['Aisha K.', 'Daniel R.', 'Meera S.', 'Tom B.', 'Sofia L.', 'Karan P.', 'Hannah W.', 'Luis G.', 'Priya N.', 'Chen Y.', 'Olivia M.', 'Rahul D.'];

function hash(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const books = [];
const reviews = [];
let idx = 0;
for (const [genre, list] of Object.entries(RAW)) {
	list.forEach((line) => {
		const [title, author, language, hook] = line.split('|');
		const r = rng(hash(title));
		const n = NAMES[Math.floor(r() * NAMES.length)];
		const p = PLACES[Math.floor(r() * PLACES.length)];
		const tpl = EXCERPT[genre][0];
		const priceBase = genre === 'Technology' ? 24 + r() * 24 : genre === 'Poetry' ? 8 + r() * 6 : 9 + r() * 15;
		const price = Math.floor(priceBase) + 0.99;
		const age = Math.floor(r() * 520);
		const publishedAt = new Date(REF - (idx % 9 === 0 ? 3 + Math.floor(r() * 30) : 45 + age) * DAY).toISOString();
		const book = {
			title,
			author,
			genre,
			language,
			description: `${hook} ${SENTENCE[genre]}`,
			excerpt: tpl.replace(/\{n\}/g, n).replace(/\{p\}/g, p),
			price,
			stock: idx % 11 === 0 ? 2 + Math.floor(r() * 3) : 12 + Math.floor(r() * 70),
			pages: 96 + Math.floor(r() * 460),
			sold: 15 + Math.floor(Math.pow(r(), 2) * 900),
			publishedAt,
			image: '',
		};
		const count = 2 + Math.floor(r() * 4);
		let sum = 0;
		for (let k = 0; k < count; k++) {
			const rating = r() < 0.55 ? 5 : r() < 0.7 ? 4 : r() < 0.85 ? 4 : 3;
			const pool = REVIEW[rating];
			sum += rating;
			reviews.push({
				book: idx,
				name: REVIEWERS[Math.floor(r() * REVIEWERS.length)],
				rating,
				text: pool[Math.floor(r() * pool.length)],
				daysAgo: 2 + Math.floor(r() * 200),
			});
		}
		book.rating = Math.round((sum / count) * 10) / 10;
		book.numReviews = count;
		books.push(book);
		idx++;
	});
}

const out = JSON.stringify({ books, reviews, genres: GENRE_BLURB }, null, 1);
const targets = [path.join(__dirname, 'catalog.json'), path.join(__dirname, '..', '..', 'Frontend', 'src', 'demo', 'catalog.json')];
for (const t of targets) {
	fs.mkdirSync(path.dirname(t), { recursive: true });
	fs.writeFileSync(t, out);
}
console.log(`Wrote ${books.length} books and ${reviews.length} reviews`);
