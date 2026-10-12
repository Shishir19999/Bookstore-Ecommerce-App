import { Link } from 'react-router-dom'
import { api, saveFile } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { FormatIcon } from '../ui/Parts'
import { FORMAT_LABEL, authorPath, fmtDate, timeAgo } from '../lib/format'

// The reader's digital library: purchased e-books and audiobooks with reading progress.
export default function Library() {
  useTitle('My library')
  const { data, error, loading, reload } = useFetch('/api/me/library')
  const toast = useToast()
  const download = async (b) => {
    try {
      const t = await api(`/api/books/${b._id}/text?format=ebook`)
      const body = [`${t.book.title}`, `by ${t.book.author}`, '', ...t.chapters.flatMap((c) => [c.title.toUpperCase(), '', ...c.paragraphs.flatMap((p) => [p, '']), ''])].join('\n')
      saveFile(body, `${t.book.slug || 'book'}.txt`)
      toast.success('Downloaded a plain-text copy.')
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />
  return (
    <div className="container page">
      <p className="eyebrow">Digital</p>
      <h1>My library</h1>
      {data.length === 0 ? (
        <EmptyState title="Your library is empty" text="E-books and audiobooks you buy appear here instantly. Every e-book also has a free sample you can read in the browser." to="/books?format=ebook" action="Find an e-book" />
      ) : (
        <ul className="lib-grid">
          {data.map((e) => {
            const b = e.book
            const pct = Math.round(e.progress?.pct || 0)
            return (
              <li key={b._id} className="card lib-card">
                <Link to={`/books/${b._id}`} aria-label={`${b.title}, details`} tabIndex={-1}><Cover book={b} /></Link>
                <div className="lib-body">
                  <Link to={`/books/${b._id}`} className="book-title">{b.title}</Link>
                  <Link to={authorPath(b.author)} className="book-author">{b.author}</Link>
                  <div className="row" style={{ gap: 6 }}>{e.formats.map((f) => <span key={f} className="pill"><FormatIcon type={f} /> {FORMAT_LABEL[f]}</span>)}</div>
                  {e.releasesAt ? (
                    <p className="small"><span className="pill pill-accent">Pre-ordered</span> Available {fmtDate(e.releasesAt)}</p>
                  ) : (
                    <>
                      {e.formats.includes('ebook') && (
                        <>
                          <div className="meter" role="progressbar" aria-label={`Reading progress for ${b.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
                          <p className="small muted" style={{ margin: 0 }}>{pct ? `${pct}% read` : 'Not started'}{e.lastReadAt ? ` · ${timeAgo(e.lastReadAt)}` : ''}{e.highlights ? ` · ${e.highlights} highlight${e.highlights === 1 ? '' : 's'}` : ''}</p>
                        </>
                      )}
                      <div className="row" style={{ marginTop: 'auto' }}>
                        {e.formats.includes('ebook') && <Link className="btn btn-primary btn-sm" to={`/read/${b._id}`}>{pct ? 'Continue reading' : 'Start reading'}</Link>}
                        {e.formats.includes('audiobook') && <Link className="btn btn-sm" to={`/listen/${b._id}`}>Listen</Link>}
                        {e.formats.includes('ebook') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(b)}>Download .txt</button>}
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
