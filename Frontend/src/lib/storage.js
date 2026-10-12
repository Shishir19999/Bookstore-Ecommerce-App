// Small per-device conveniences kept in localStorage (always wrapped: storage can be blocked or full).
const read = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

const RECENT_KEY = 'folio_recent'
export const getRecent = () => read(RECENT_KEY, []).filter((x) => typeof x === 'string')
export function pushRecent(id) {
  write(RECENT_KEY, [id, ...getRecent().filter((x) => x !== id)].slice(0, 12))
}

const READER_KEY = 'folio_reader_prefs'
export const DEFAULT_READER = { size: 19, font: 'serif', theme: 'paper', spacing: 1.7 }
export const getReaderPrefs = () => ({ ...DEFAULT_READER, ...read(READER_KEY, {}) })
export const saveReaderPrefs = (p) => write(READER_KEY, p)

// Reader progress for signed-out visitors (signed-in readers sync to their account).
export const getGuestReader = (bookId) => read(`folio_reader_${bookId}`, { progress: null, bookmarks: [], highlights: [] })
export const saveGuestReader = (bookId, state) => write(`folio_reader_${bookId}`, state)

export const getJSON = read
export const setJSON = write
