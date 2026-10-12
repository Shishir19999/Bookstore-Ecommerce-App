// Reader-side rules: chapter text, reading goals, streaks and statistics. Pure functions, shared by API and preview.
import { addDays, dayKey, round1 } from './rules.mjs'

// ---------- deterministic text for titles without a bundled public-domain text ----------
function seeded(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, list) => list[Math.floor(r() * list.length)]

const NAMES = ['Wren', 'Corin', 'Ila', 'Teodor', 'Marit', 'Quill', 'Soren', 'Anya', 'Bram', 'Nell', 'Isadora', 'Pell']
const PLACES = ['the harbour district', 'the old observatory', 'Hollin Ridge', 'the lower market', 'the salt flats', 'Marrow Street', 'the north terminal', 'the river gate']
const THINGS = ['brass key', 'unsigned letter', 'folded map', 'cracked lantern', 'ledger with torn pages', 'small blue notebook', 'tin of old photographs']

const BANK = {
  Fantasy: [
    '{n} turned the {t} over in both hands. It was warmer than it had any right to be.',
    'Somewhere beyond {p}, a bell rang the wrong hour, and every door on the street opened a finger-width.',
    '"You were not meant to find that," said the old woman, though she did not take it back.',
    'The road forgot its own way twice before noon, and {n} began to suspect it did so on purpose.',
    'Rumour in {p} held that the kingdom had been drawn rather than built, and that the map was still being corrected.',
    'It is a poor sort of magic that asks nothing of the person who uses it, {n} thought, and kept walking.',
    'They shared bread and silence, which in that country counted as a treaty.',
    'By lamplight the walls showed their other doors, the ones that had been painted over a hundred winters ago.',
  ],
  'Science Fiction': [
    'The station hummed its patient note, and {n} listened for the one that had gone missing.',
    '"Telemetry is nominal," said the ship, which was how {n} knew something was not.',
    'Three light-minutes from {p}, the signal repeated itself, each time a little more like a voice.',
    'Nobody had planned for the quiet. Systems that were built to be loud do not know how to stop.',
    '{n} logged the anomaly, then logged the fact that logging it felt like an act of courage.',
    'The corridor lights pretended to be morning. Down the hall, the garden had already started its own day.',
    'It was not a question of whether the machine understood. It was a question of what it had decided to forgive.',
    'On the long wall, the star chart quietly redrew a coastline no one had surveyed.',
  ],
  Mystery: [
    'The rain had the look of something that meant to stay, and so did the man in the doorway.',
    '{n} read the note a third time. Four lines, no signature, and a spelling mistake no educated person makes by accident.',
    '"Everyone lies," said the constable, "but they lie in different handwriting."',
    'The clock in {p} had stopped at 9:42, which was either a coincidence or a very bad joke.',
    'There was tea on the table, still warm, and two cups, and only one chair pulled out.',
    '{n} did not believe in hunches, only in details that were waiting to be noticed in the right order.',
    'It was the kind of alibi that held perfectly until someone leaned on it.',
    'The ledger balanced. That, more than anything, was what was wrong with it.',
  ],
  Romance: [
    '{n} had rehearsed the conversation the whole walk to {p}, and then the door opened and every sentence left at once.',
    '"I was just passing," {n} said, which was false, and both of them knew it.',
    'They stood under the same awning while the rain made up its mind, and neither of them hurried it.',
    'There is a particular kind of silence between two people who are about to say something kind. This was that silence.',
    'The letter had been rewritten four times. The fifth version said only: come by on Thursday.',
    'He laughed at the wrong joke, and she decided, quietly, that she liked the wrong joke better.',
    'Whatever it was, it was not nothing, and by evening neither of them pretended otherwise.',
    'The kettle clicked off. Neither moved to answer it.',
  ],
  'Historical Fiction': [
    'By the time the bells rang over {p}, {n} had already hidden the {t} beneath the third floorboard from the window.',
    'Carts rolled past in the grey light, and everyone in the street pretended not to listen.',
    'In that year the winter came early, and the price of candles told you more than the newspapers did.',
    '"Write it down," said the clerk, "because in ten years nobody will believe it."',
    '{n} counted the coins twice, which was one more time than the sum deserved.',
    'The harbour smelled of tar and weather. Somewhere a ship was being quietly renamed.',
    'It was understood in {p} that a promise made at that table was a promise kept, whatever the cost of the candles.',
    'Letters travelled slower than rumour then, but they were harder to take back.',
  ],
  'Science & Nature': [
    'Walk to {p} at low tide and look down. Within a single step there are more lives going on than in a whole city block.',
    'Nearly every organism you can see is solving the same problem: how to be somewhere, and stay there, and not be eaten.',
    'The surprising thing about weather is how little of it is weather and how much of it is water changing its mind.',
    'Scientists call this convergence: unrelated animals, different centuries, the same clever shape.',
    'It helps to start with a question small enough to test with a jar, a notebook and a free afternoon.',
    'The numbers are large, but the idea is simple: everything that falls is also being pulled.',
    'Consider the humble lichen, which is neither one thing nor the other and has done rather well out of that.',
    'What looks like stillness in a forest is a conversation conducted at the speed of roots.',
  ],
  Technology: [
    'Every system you will ever maintain was once someone\'s clean idea. The trouble starts a year later.',
    'A good interface is a promise: this is what will happen when you press that. Break the promise and you break trust.',
    'Start with the test that describes the behaviour, then change the structure. In that order, every time.',
    'The fastest query is the one you do not make, and the second fastest is the one with the right index.',
    'Logs tell you what happened. Metrics tell you how often. Traces tell you why it was slow. You need all three, in proportion.',
    'Small releases are not a technique, they are a posture: assume you are wrong and make it cheap to find out.',
    'Naming is design. If you cannot name a function without the word "and", it probably does two things.',
    'Treat every migration as a rehearsal for the next one.',
  ],
}
const LINES = [
  'Morning arrives in the kitchen first,', 'the kettle clearing its throat,', 'the window wearing yesterday\'s rain', 'like a coat it forgot to return.',
  'Somewhere near the river a boy', 'is learning to whistle', 'and getting it wrong', 'in exactly the right key.',
  'I kept your words in a coat pocket', 'until they wore a shape of their own,', 'and now the lining holds', 'a small, persistent weather.',
  'The tide takes what it can carry', 'and leaves the rest as evidence:', 'a shoe, a shell, a sentence', 'nobody finished saying.',
  'There are rooms we only visit', 'by closing our eyes on purpose,', 'and the light in them is always', 'the colour of late October.',
  'We learned the names of birds', 'to have something to hold', 'when the other names', 'grew too heavy to say.',
]

// Picks without repeating a sentence inside the paragraph, and avoids sentences already used in the chapter when it can.
function paragraph(r, bank, ctx, used) {
  const n = 3 + Math.floor(r() * 3)
  const out = []
  const fresh = bank.filter((s) => !used.has(s))
  const pool = (fresh.length >= n ? fresh : bank).slice()
  for (let i = 0; i < n && pool.length; i++) {
    const s = pool.splice(Math.floor(r() * pool.length), 1)[0]
    used.add(s)
    out.push(s)
  }
  return out
    .join(' ')
    .replace(/\{n\}/g, ctx.n)
    .replace(/\{p\}/g, ctx.p)
    .replace(/\{t\}/g, ctx.t)
}

// Chapters for a title: real public-domain text when bundled (classics), otherwise generated deterministically.
// Returns [{ title, paragraphs: [string] }].
export function chaptersFor(book, classics) {
  const real = classics?.[book.slug]
  if (real) return real.chapters
  const r = seeded(book.title + '|' + book.author)
  const ctx = { n: pick(r, NAMES), p: pick(r, PLACES), t: pick(r, THINGS) }
  const poetry = book.genre === 'Poetry'
  const bank = BANK[book.genre] || BANK.Fantasy
  const count = poetry ? 4 : 3
  const chapters = []
  for (let c = 0; c < count; c++) {
    const paragraphs = []
    const used = new Set()
    if (c === 0 && book.excerpt) paragraphs.push(...String(book.excerpt).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean))
    if (poetry) {
      for (let s = 0; s < 3; s++) paragraphs.push(Array.from({ length: 4 }, () => pick(r, LINES)).join('\n'))
    } else {
      const extra = c === 0 ? 4 : 6
      for (let p = 0; p < extra; p++) paragraphs.push(paragraph(r, bank, ctx, used))
    }
    chapters.push({ title: poetry ? `Part ${['I', 'II', 'III', 'IV'][c]}` : `Chapter ${c + 1}`, paragraphs })
  }
  return chapters
}
export const wordCount = (chapters) => chapters.reduce((s, c) => s + c.paragraphs.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0), 0)
export const readingMinutes = (words) => Math.max(1, Math.round(words / 230))
// Free sample: the first chapter, cut to about 40% of its paragraphs (at least 3).
export function sampleChapters(chapters) {
  const first = chapters[0]
  const keep = Math.max(3, Math.ceil(first.paragraphs.length * 0.5))
  return [{ ...first, paragraphs: first.paragraphs.slice(0, keep) }]
}

// ---------- streaks, goals, stats ----------
// dates: Set/array of 'YYYY-MM-DD' on which the reader was active. today: 'YYYY-MM-DD'.
export function streaks(dates, today) {
  const set = new Set(dates)
  let current = 0
  let cursor = set.has(today) ? today : addDays(today, -1)
  while (set.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }
  const sorted = [...set].sort()
  let longest = 0
  let run = 0
  let prev = null
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  return { current, longest, activeToday: set.has(today) }
}

export function goalProgress(goal, finished, today) {
  if (!goal || !goal.books) return null
  const year = Number(goal.year)
  const start = new Date(`${year}-01-01T00:00:00Z`).getTime()
  const end = new Date(`${year + 1}-01-01T00:00:00Z`).getTime()
  const now = new Date(today + 'T12:00:00Z').getTime()
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)))
  const expected = Math.round(goal.books * elapsed * 10) / 10
  const diff = round1(finished - expected)
  const status = finished >= goal.books ? 'done' : diff >= 0.5 ? 'ahead' : diff <= -1 ? 'behind' : 'on-track'
  const pct = Math.min(100, Math.round((finished / goal.books) * 100))
  const left = Math.max(0, goal.books - finished)
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000))
  const perMonth = daysLeft > 0 ? round1(left / (daysLeft / 30.4)) : left
  return { year, target: goal.books, finished, pct, expected, status, behindBy: status === 'behind' ? Math.ceil(-diff) : 0, left, daysLeft, perMonth }
}

// Builds the stats payload from finished books [{book, finishedAt}] and activity rows [{date, minutes, pages}].
export function readingStats({ finished, activity, goal, today, year }) {
  const inYear = finished.filter((f) => f.finishedAt && new Date(f.finishedAt).getUTCFullYear() === year)
  const byMonth = Array.from({ length: 12 }, () => 0)
  const byGenre = {}
  let pages = 0
  for (const f of inYear) {
    byMonth[new Date(f.finishedAt).getUTCMonth()]++
    const g = f.book.genre || 'Other'
    byGenre[g] = (byGenre[g] || 0) + 1
    pages += Number(f.book.pages) || 0
  }
  const dates = new Set([...activity.map((a) => a.date), ...finished.filter((f) => f.finishedAt).map((f) => dayKey(f.finishedAt))])
  const minutes = activity.filter((a) => a.date.startsWith(String(year))).reduce((s, a) => s + (a.minutes || 0), 0)
  const heat = []
  for (let i = 83; i >= 0; i--) {
    const key = addDays(today, -i)
    heat.push({ date: key, minutes: activity.find((a) => a.date === key)?.minutes || 0 })
  }
  const genres = Object.entries(byGenre).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  return {
    year,
    finishedCount: inYear.length,
    pages,
    minutes,
    byMonth,
    genres,
    favouriteGenre: genres[0]?.name || null,
    streak: streaks(dates, today),
    goal: goalProgress(goal && Number(goal.year) === year ? goal : null, inYear.length, today),
    heat,
    avgPages: inYear.length ? Math.round(pages / inYear.length) : 0,
  }
}
