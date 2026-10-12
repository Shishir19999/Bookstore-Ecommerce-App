import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useTitle } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import Cover from '../ui/Cover'
import Narration from '../ui/Narration'
import { getJSON, setJSON } from '../lib/storage'

// Audiobook player: narrates the book text with the browser's speech synthesis. Owners hear the full text, everyone else the sample.
export default function Listen() {
  const { id } = useParams()
  const { user } = useAuth()
  const [text, setText] = useState(null)
  const [error, setError] = useState('')
  const saved = getJSON(`folio_listen_${id}`, { chapter: 0, para: 0 })
  const [ch, setCh] = useState(saved.chapter)
  useTitle(text ? `Listening to ${text.book.title}` : 'Audiobook')
  useEffect(() => {
    let cancelled = false
    api(`/api/books/${id}/text?format=audiobook`).then(
      (t) => !cancelled && setText(t),
      (e) => !cancelled && setError(e.message)
    )
    return () => {
      cancelled = true
    }
  }, [id, user])
  if (error) return <div className="container page"><ErrorState title="Cannot open this audiobook" message={error} /></div>
  if (!text) return <PageSkeleton />
  const chapter = text.chapters[Math.min(ch, text.chapters.length - 1)]
  const audio = text.book.formats.find((f) => f.type === 'audiobook')
  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <Link to="/library" className="small">&larr; Library</Link>
      <div className="listen-head">
        <div style={{ width: 120 }}><Cover book={text.book} eager /></div>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2.2rem)', marginBottom: 4 }}>{text.book.title}</h1>
          <p className="muted" style={{ margin: 0 }}>by {text.book.author}{audio?.narrator ? ` · narrated by ${audio.narrator}` : ''}</p>
          <p className="small muted">{text.full ? 'Full audiobook' : 'Free sample'}{audio?.minutes ? ` · ${Math.round(audio.minutes / 60 * 10) / 10} h in the full edition` : ''}</p>
        </div>
      </div>
      <label className="row small" style={{ margin: '12px 0' }}>
        Chapter
        <select className="input" style={{ width: 'auto' }} value={ch} onChange={(e) => (setCh(Number(e.target.value)), setJSON(`folio_listen_${id}`, { chapter: Number(e.target.value), para: 0 }))}>
          {text.chapters.map((c, i) => <option key={i} value={i}>{c.title}</option>)}
        </select>
      </label>
      <Narration key={`${id}-${ch}`} title={`${text.book.title}, ${chapter.title}`} paragraphs={chapter.paragraphs} start={ch === saved.chapter ? saved.para : 0} onProgress={(p) => setJSON(`folio_listen_${id}`, { chapter: ch, para: p })} onListened={user ? (minutes) => api('/api/me/activity', { method: 'POST', body: { minutes } }).catch(() => {}) : undefined} />
      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn" disabled={ch === 0} onClick={() => setCh(ch - 1)}>&larr; Previous chapter</button>
        <button type="button" className="btn" disabled={ch >= text.chapters.length - 1} onClick={() => setCh(ch + 1)}>Next chapter &rarr;</button>
        {!text.full && <Link className="btn btn-primary" to={`/books/${id}`}>Get the full audiobook</Link>}
      </div>
    </div>
  )
}
