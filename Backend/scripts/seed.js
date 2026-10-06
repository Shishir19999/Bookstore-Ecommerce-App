// Idempotent, deterministic seed: node scripts/seed.js [--reset]  (or `npm run seed` in Backend).
// Upserts books by title+author and users by email; seed orders use fixed _ids.
// --reset additionally deletes ALL orders before reseeding the seed orders.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const Book = require('../models/Book');
const User = require('../models/User');
const Order = require('../models/Order');

faker.seed(20261002);
const PASSWORD = 'Password123!';
const REF = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 86400000;
const reset = process.argv.includes('--reset');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const img = (t) => `https://picsum.photos/seed/${slug(t)}/400/600`;

const catalog = {
	Fiction: ['The Great Gatsby|F. Scott Fitzgerald', 'To Kill a Mockingbird|Harper Lee', 'The Catcher in the Rye|J.D. Salinger', 'Beloved|Toni Morrison', 'The Kite Runner|Khaled Hosseini', 'Life of Pi|Yann Martel', 'The Alchemist|Paulo Coelho', 'One Hundred Years of Solitude|Gabriel Garcia Marquez', 'The Road|Cormac McCarthy', 'Of Mice and Men|John Steinbeck', 'The Remains of the Day|Kazuo Ishiguro', 'A Thousand Splendid Suns|Khaled Hosseini', 'The Book Thief|Markus Zusak', 'Atonement|Ian McEwan', 'The Old Man and the Sea|Ernest Hemingway'],
	Dystopian: ['1984|George Orwell', 'Animal Farm|George Orwell', 'Brave New World|Aldous Huxley', 'Fahrenheit 451|Ray Bradbury', 'The Handmaid\'s Tale|Margaret Atwood', 'The Hunger Games|Suzanne Collins', 'Never Let Me Go|Kazuo Ishiguro', 'We|Yevgeny Zamyatin', 'A Clockwork Orange|Anthony Burgess', 'Station Eleven|Emily St. John Mandel', 'Divergent|Veronica Roth', 'The Giver|Lois Lowry', 'Oryx and Crake|Margaret Atwood', 'Parable of the Sower|Octavia E. Butler', 'Snow Crash|Neal Stephenson'],
	Romance: ['Pride and Prejudice|Jane Austen', 'Jane Eyre|Charlotte Bronte', 'Sense and Sensibility|Jane Austen', 'Outlander|Diana Gabaldon', 'The Notebook|Nicholas Sparks', 'Me Before You|Jojo Moyes', 'Wuthering Heights|Emily Bronte', 'Emma|Jane Austen', 'The Time Traveler\'s Wife|Audrey Niffenegger', 'Beach Read|Emily Henry', 'The Hating Game|Sally Thorne', 'Persuasion|Jane Austen', 'Normal People|Sally Rooney', 'Red, White & Royal Blue|Casey McQuiston', 'It Ends with Us|Colleen Hoover'],
	Fantasy: ['The Hobbit|J.R.R. Tolkien', 'The Fellowship of the Ring|J.R.R. Tolkien', 'Harry Potter and the Sorcerer\'s Stone|J.K. Rowling', 'A Game of Thrones|George R.R. Martin', 'The Name of the Wind|Patrick Rothfuss', 'The Lion, the Witch and the Wardrobe|C.S. Lewis', 'A Wizard of Earthsea|Ursula K. Le Guin', 'Mistborn: The Final Empire|Brandon Sanderson', 'The Way of Kings|Brandon Sanderson', 'American Gods|Neil Gaiman', 'Good Omens|Terry Pratchett & Neil Gaiman', 'The Eye of the World|Robert Jordan', 'Assassin\'s Apprentice|Robin Hobb', 'Circe|Madeline Miller', 'Eragon|Christopher Paolini'],
	'Science Fiction': ['Dune|Frank Herbert', 'Neuromancer|William Gibson', 'The Martian|Andy Weir', 'Foundation|Isaac Asimov', 'Ender\'s Game|Orson Scott Card', 'The Left Hand of Darkness|Ursula K. Le Guin', 'Hyperion|Dan Simmons', 'The Three-Body Problem|Liu Cixin', 'Ready Player One|Ernest Cline', 'Project Hail Mary|Andy Weir', 'I, Robot|Isaac Asimov', 'Childhood\'s End|Arthur C. Clarke', 'The Forever War|Joe Haldeman', 'Red Mars|Kim Stanley Robinson', 'Solaris|Stanislaw Lem'],
	Thriller: ['Gone Girl|Gillian Flynn', 'The Girl with the Dragon Tattoo|Stieg Larsson', 'The Silence of the Lambs|Thomas Harris', 'The Da Vinci Code|Dan Brown', 'The Girl on the Train|Paula Hawkins', 'Shutter Island|Dennis Lehane', 'The Bourne Identity|Robert Ludlum', 'Rebecca|Daphne du Maurier', 'The Talented Mr. Ripley|Patricia Highsmith', 'Before I Go to Sleep|S.J. Watson', 'The Silent Patient|Alex Michaelides', 'Misery|Stephen King', 'The Day of the Jackal|Frederick Forsyth', 'Verity|Colleen Hoover', 'Big Little Lies|Liane Moriarty'],
	Mystery: ['And Then There Were None|Agatha Christie', 'The Hound of the Baskervilles|Arthur Conan Doyle', 'Murder on the Orient Express|Agatha Christie', 'The Maltese Falcon|Dashiell Hammett', 'The Big Sleep|Raymond Chandler', 'In the Woods|Tana French', 'The Thursday Murder Club|Richard Osman', 'A Study in Scarlet|Arthur Conan Doyle', 'The Name of the Rose|Umberto Eco', 'The Cuckoo\'s Calling|Robert Galbraith', 'Death on the Nile|Agatha Christie', 'The Moonstone|Wilkie Collins', 'Knives Out Casebook|Mara Ellison', 'The Secret History|Donna Tartt', 'Gaudy Night|Dorothy L. Sayers'],
	'Non-Fiction': ['Sapiens|Yuval Noah Harari', 'Atomic Habits|James Clear', 'Educated|Tara Westover', 'Thinking, Fast and Slow|Daniel Kahneman', 'Guns, Germs, and Steel|Jared Diamond', 'The Immortal Life of Henrietta Lacks|Rebecca Skloot', 'Born a Crime|Trevor Noah', 'Quiet|Susan Cain', 'Outliers|Malcolm Gladwell', 'A Brief History of Time|Stephen Hawking', 'Becoming|Michelle Obama', 'The Power of Habit|Charles Duhigg', 'Man\'s Search for Meaning|Viktor Frankl', 'Freakonomics|Steven D. Levitt', 'Cosmos|Carl Sagan'],
	Technology: ['Clean Code|Robert C. Martin', 'The Pragmatic Programmer|Andrew Hunt & David Thomas', 'Designing Data-Intensive Applications|Martin Kleppmann', 'Introduction to Algorithms|Thomas H. Cormen', 'Refactoring|Martin Fowler', 'You Don\'t Know JS Yet|Kyle Simpson', 'Eloquent JavaScript|Marijn Haverbeke', 'The Mythical Man-Month|Frederick P. Brooks Jr.', 'Code Complete|Steve McConnell', 'Design Patterns|Erich Gamma et al.', 'Structure and Interpretation of Computer Programs|Harold Abelson', 'Site Reliability Engineering|Betsy Beyer', 'The Phoenix Project|Gene Kim', 'Python Crash Course|Eric Matthes', 'Learning React|Alex Banks & Eve Porcello'],
	Biography: ['The Diary of a Young Girl|Anne Frank', 'Steve Jobs|Walter Isaacson', 'Long Walk to Freedom|Nelson Mandela', 'The Autobiography of Malcolm X|Malcolm X & Alex Haley', 'Einstein: His Life and Universe|Walter Isaacson', 'Open|Andre Agassi', 'Bossypants|Tina Fey', 'Wild|Cheryl Strayed', 'I Am Malala|Malala Yousafzai', 'Shoe Dog|Phil Knight', 'Alexander Hamilton|Ron Chernow', 'Elon Musk|Ashlee Vance', 'Just Kids|Patti Smith', 'Into the Wild|Jon Krakauer', 'Hillbilly Elegy|J.D. Vance'],
};
const tone = {
	Fiction: ['a moving story of family, memory and loss', 'a beautifully written portrait of ordinary lives', 'a modern classic of literary fiction'],
	Dystopian: ['a chilling vision of society under control', 'a warning about power, technology and freedom', 'a gripping tale of resistance in a broken world'],
	Romance: ['a heartfelt love story full of wit and longing', 'a tender tale of second chances', 'an unforgettable romance across class and circumstance'],
	Fantasy: ['an epic quest across richly imagined lands', 'a tale of magic, courage and ancient powers', 'a sweeping adventure with unforgettable characters'],
	'Science Fiction': ['a visionary look at the future of humanity', 'a thrilling adventure among the stars', 'a thought-provoking story of science and survival'],
	Thriller: ['a pulse-pounding page turner with twists at every turn', 'a tense psychological thriller', 'a fast-paced story of deception and danger'],
	Mystery: ['a classic whodunit with a clever solution', 'an atmospheric mystery full of secrets', 'a puzzle that keeps you guessing to the last page'],
	'Non-Fiction': ['an insightful and accessible look at the world', 'a landmark work that changes how you think', 'a compelling blend of research and storytelling'],
	Technology: ['an essential guide for working developers', 'a practical handbook of proven techniques', 'a deep dive into the principles behind modern software'],
	Biography: ['an intimate and honest life story', 'a revealing portrait of an extraordinary person', 'a candid account of ambition, struggle and triumph'],
};

(async () => {
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bookStore');

	// books
	const bookDefs = [];
	for (const [genre, list] of Object.entries(catalog)) {
		for (const item of list) {
			const [title, author] = item.split('|');
			const price = Math.round(faker.number.float({ min: 7.5, max: genre === 'Technology' ? 59 : 24 }) * 100) / 100;
			const description = `${title} by ${author}: ${faker.helpers.arrayElement(tone[genre])}. ${faker.helpers.arrayElement(['Highly recommended for readers of the genre.', 'A bestseller loved by critics and readers alike.', 'A perfect addition to your shelf.'])}`;
			bookDefs.push({ title, author, genre, description, price });
		}
	}
	const books = [];
	for (const b of bookDefs) {
		await Book.updateOne({ title: b.title, author: b.author }, { $set: { genre: b.genre, description: b.description, price: b.price, image: img(b.title) } }, { upsert: true });
		books.push(await Book.findOne({ title: b.title, author: b.author }));
	}

	// users (password hashed by model hook, only on creation)
	const userDefs = [['Admin Demo', 'admin@example.com'], ['Demo User', 'user@example.com']];
	const seen = new Set(userDefs.map((u) => u[1]));
	while (userDefs.length < 20) {
		const f = faker.person.firstName(), l = faker.person.lastName();
		const email = `${slug(f)}.${slug(l)}@example.com`;
		if (seen.has(email)) continue;
		seen.add(email);
		userDefs.push([`${f} ${l}`, email]);
	}
	const users = [];
	for (const [name, email] of userDefs) {
		let u = await User.findOne({ email });
		if (!u) u = await User.create({ name, email, password: PASSWORD });
		const role = email === 'admin@example.com' ? 'admin' : 'user';
		if (u.role !== role) { await User.updateOne({ _id: u._id }, { role }); u.role = role; }
		users.push(u);
	}

	// orders with deterministic ids
	const orders = [];
	for (let i = 0; i < 50; i++) {
		const user = users[faker.number.int({ min: 0, max: users.length - 1 })];
		const picks = faker.helpers.arrayElements(books, faker.number.int({ min: 1, max: 5 }));
		const items = picks.map((b) => ({ _id: new mongoose.Types.ObjectId(), book: b._id, title: b.title, price: b.price, qty: faker.number.int({ min: 1, max: 3 }) }));
		const total = Math.round(items.reduce((s, x) => s + x.price * x.qty, 0) * 100) / 100;
		const createdAt = new Date(REF - faker.number.int({ min: 1, max: 150 }) * DAY - faker.number.int({ min: 0, max: 80000 }) * 1000);
		orders.push({ _id: new mongoose.Types.ObjectId(('b00c' + String(i).padStart(4, '0')).padEnd(24, '0')), user: user._id, items, total, paymentStatus: 'paid (mock)', createdAt, updatedAt: createdAt, __v: 0 });
	}
	if (reset) await Order.deleteMany({});
	else await Order.collection.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
	await Order.collection.insertMany(orders);

	console.log(`Seeded: ${await Book.countDocuments()} books, ${await User.countDocuments()} users, ${await Order.countDocuments()} orders`);
	console.log(`Demo logins (password ${PASSWORD}): admin@example.com, user@example.com`);
	await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
