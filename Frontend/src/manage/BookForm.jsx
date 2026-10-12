import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useTitle, useToast } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import { Field } from '../ui/Parts'
import ManageNav from './ManageNav'
import Cover from '../ui/Cover'
import { FORMAT_LABEL } from '../lib/format'
import { FORMATS, isPhysical, suggestedPrice, validIsbn } from '../shared/rules.mjs'

const GENRES = ['Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'Historical Fiction', 'Science & Nature', 'Technology', 'Poetry', 'Classics']
const empty = { title: '', author: '', genre: '', language: 'English', publisher: '', pages: '', description: '', excerpt: '', image: '', isbn: '', seriesName: '', seriesNumber: '', tags: '', publishedAt: '' }
const blankFormat = (type, price = '') => ({ on: false, type, price, stock: '20', isbn: '', edition: '', minutes: '', narrator: '' })

function validate(f, formats, file) {
  const e = {}
  if (!f.title.trim()) e.title = 'Title is required.'
  if (!f.author.trim()) e.author = 'Author is required.'
  if (f.pages !== '' && (!Number.isInteger(Number(f.pages)) || Number(f.pages) < 1)) e.pages = 'Pages must be a whole number, 1 or more.'
  if (f.isbn && !validIsbn(f.isbn)) e.isbn = 'Not a valid ISBN-10 or ISBN-13.'
  if (f.image && !/^https?:\/\//i.test(f.image) && !f.image.startsWith('data:image/')) e.image = 'Use a full http(s) image URL, or upload a file.'
  if (file && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) e.file = 'Cover must be a JPEG, PNG, WebP or GIF image.'
  if (file && file.size > 2 * 1024 * 1024) e.file = 'Cover image must be 2MB or smaller.'
  if (f.seriesNumber !== '' && (!Number.isInteger(Number(f.seriesNumber)) || Number(f.seriesNumber) < 1)) e.seriesNumber = 'Use a whole number, 1 or more.'
  const on = FORMATS.filter((t) => formats[t].on)
  if (on.length === 0) e.formats = 'Offer at least one edition.'
  for (const t of on) {
    const x = formats[t]
    if (x.price === '' || !Number.isFinite(Number(x.price)) || Number(x.price) < 0) e[`${t}-price`] = 'Enter a price of 0 or more.'
    if (isPhysical(t) && (!Number.isInteger(Number(x.stock)) || Number(x.stock) < 0)) e[`${t}-stock`] = 'Stock must be a whole number, 0 or more.'
    if (x.isbn && !validIsbn(x.isbn)) e[`${t}-isbn`] = 'Not a valid ISBN.'
  }
  return e
}

// Add (no :id) or edit (:id) a book: details, editions with their own prices and stock, series, release date and cover.
export default function BookForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  useTitle(id ? 'Edit book' : 'Add book')
  const prefill = loc.state?.prefill
  const [form, setForm] = useState({ ...empty, ...(prefill || {}) })
  const [formats, setFormats] = useState(() => {
    const base = Object.fromEntries(FORMATS.map((t) => [t, blankFormat(t)]))
    if (prefill?.price) base.paperback = { ...base.paperback, on: true, price: String(prefill.price), stock: String(prefill.stock ?? 10), isbn: prefill.isbn || '' }
    else if (!id) base.paperback = { ...base.paperback, on: true }
    return base
  })
  const [file, setFile] = useState(null)
  const [serverImage, setServerImage] = useState('')
  const [errors, setErrors] = useState({})
  const [loadError, setLoadError] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!!id)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api(`/api/books/${id}`)
      .then((b) => {
        if (cancelled) return
        setForm({
          title: b.title || '', author: b.author || '', genre: b.genre || '', language: b.language || '', publisher: b.publisher || '', pages: b.pages ? String(b.pages) : '',
          description: b.description || '', excerpt: b.excerpt || '', isbn: b.isbn || '', seriesName: b.series?.name || '', seriesNumber: b.series ? String(b.series.number) : '',
          tags: (b.tags || []).join(', '), publishedAt: b.publishedAt ? b.publishedAt.slice(0, 10) : '',
          image: b.image && !b.image.startsWith('/uploads/') && !b.image.startsWith('data:') ? b.image : '',
        })
        const next = Object.fromEntries(FORMATS.map((t) => [t, blankFormat(t)]))
        for (const f of b.formats) next[f.type] = { on: true, type: f.type, price: String(f.price), stock: String(f.stock ?? 20), isbn: f.isbn || '', edition: f.edition || '', minutes: f.minutes ? String(f.minutes) : '', narrator: f.narrator || '' }
        setFormats(next)
        setServerImage(b.image || '')
      })
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl])
  const preview = fileUrl || form.image || serverImage || prefill?.image
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setF = (t, k, v) => setFormats({ ...formats, [t]: { ...formats[t], [k]: v } })

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate(form, formats, file)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const fmts = FORMATS.filter((t) => formats[t].on).map((t) => {
        const x = formats[t]
        return { type: t, price: Number(x.price), ...(isPhysical(t) ? { stock: Number(x.stock) } : {}), ...(x.isbn ? { isbn: x.isbn } : {}), ...(x.edition ? { edition: x.edition } : {}), ...(t === 'audiobook' && x.minutes ? { minutes: Number(x.minutes) } : {}), ...(t === 'audiobook' && x.narrator ? { narrator: x.narrator } : {}) }
      })
      const fd = new FormData()
      for (const [k, v] of Object.entries(form)) {
        if (k === 'image' && !v) continue // keep the existing cover when blank
        if (v !== '') fd.append(k, v)
      }
      if (id && form.seriesName === '') fd.append('seriesName', '')
      fd.append('formats', JSON.stringify(fmts))
      if (file) fd.append('cover', file)
      await api(id ? `/api/books/${id}` : '/api/books', { method: id ? 'PUT' : 'POST', body: fd })
      toast.success(id ? 'Book updated.' : 'Book added.')
      navigate('/manage/books')
    } catch (err) {
      setFailure(err.message)
      setBusy(false)
    }
  }
  if (loadError) return <div className="container page"><ErrorState message={loadError} /></div>
  if (loading) return <PageSkeleton />
  const upcoming = form.publishedAt && new Date(form.publishedAt) > new Date()
  return (
    <div className="container page">
      <h1>{id ? 'Edit book' : 'Add a book'}</h1>
      <ManageNav />
      <form className="card" onSubmit={submit} noValidate style={{ maxWidth: 860 }}>
        <div className="grid2">
          <Field label="Title" value={form.title} onChange={set('title')} maxLength={200} error={errors.title} />
          <Field label="Author" value={form.author} onChange={set('author')} maxLength={120} error={errors.author} />
          <Field label="Genre" value={form.genre} onChange={set('genre')} list="genre-list" maxLength={60} />
          <datalist id="genre-list">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
          <Field label="Language" value={form.language} onChange={set('language')} maxLength={40} />
          <Field label="Publisher" value={form.publisher} onChange={set('publisher')} maxLength={120} />
          <Field label="Pages" type="number" min="1" value={form.pages} onChange={set('pages')} error={errors.pages} />
          <Field label="Main ISBN" value={form.isbn} onChange={set('isbn')} error={errors.isbn} hint="ISBN-10 or ISBN-13; each edition can also have its own." />
          <Field label="Release date" type="date" value={form.publishedAt} onChange={set('publishedAt')} hint={upcoming ? 'In the future: the book is sold as a pre-order until then.' : 'Leave blank for today. A future date makes it a pre-order.'} />
          <Field label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="cosy, short, translation" />
          <Field label="Series name (optional)" value={form.seriesName} onChange={set('seriesName')} maxLength={80} />
          <Field label="Number in series" type="number" min="1" value={form.seriesNumber} onChange={set('seriesNumber')} error={errors.seriesNumber} />
        </div>

        <fieldset className="choice-group" aria-describedby={errors.formats ? 'fmt-err' : undefined}>
          <legend>Editions, prices and stock</legend>
          {errors.formats && <p className="err" id="fmt-err" role="alert">{errors.formats}</p>}
          <div className="format-editor">
            {FORMATS.map((t) => {
              const x = formats[t]
              return (
                <div key={t} className={`fe-row ${x.on ? 'on' : ''}`}>
                  <label className="row"><input type="checkbox" checked={x.on} onChange={(e) => setF(t, 'on', e.target.checked)} /> <strong>{FORMAT_LABEL[t]}</strong></label>
                  {x.on && (
                    <div className="grid2">
                      <Field label={`${FORMAT_LABEL[t]} price (USD)`} type="number" step="0.01" min="0" value={x.price} onChange={(e) => setF(t, 'price', e.target.value)} error={errors[`${t}-price`]} hint={!x.price && formats.paperback.price ? `Suggested: ${suggestedPrice(Number(formats.paperback.price), t)}` : undefined} />
                      {isPhysical(t) ? <Field label="Stock" type="number" min="0" value={x.stock} onChange={(e) => setF(t, 'stock', e.target.value)} error={errors[`${t}-stock`]} /> : <p className="hint" style={{ alignSelf: 'center' }}>Digital: unlimited copies, instant delivery.</p>}
                      <Field label="ISBN (optional)" value={x.isbn} onChange={(e) => setF(t, 'isbn', e.target.value)} error={errors[`${t}-isbn`]} />
                      <Field label="Edition note (optional)" value={x.edition} onChange={(e) => setF(t, 'edition', e.target.value)} placeholder="e.g. Collector hardcover" maxLength={60} />
                      {t === 'audiobook' && <><Field label="Length (minutes)" type="number" min="1" value={x.minutes} onChange={(e) => setF(t, 'minutes', e.target.value)} /><Field label="Narrator" value={x.narrator} onChange={(e) => setF(t, 'narrator', e.target.value)} maxLength={80} /></>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </fieldset>

        <Field label="Description" as="textarea" rows={4} maxLength={2000} value={form.description} onChange={set('description')} />
        <Field label="Preview excerpt" as="textarea" rows={6} maxLength={4000} value={form.excerpt} onChange={set('excerpt')} hint='Shown as "Read a preview" and used as the start of the e-book sample.' />
        <div className="grid2">
          <Field label="Cover image URL" type="url" value={form.image} onChange={set('image')} placeholder="https://example.com/cover.jpg" error={errors.image} />
          <Field label="...or upload a cover (max 2MB)" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files[0] || null)} error={errors.file} />
        </div>
        <div className="row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
          <div className="cover-preview"><Cover book={{ title: form.title || 'Untitled', author: form.author || 'Author', genre: form.genre, image: preview }} /></div>
          <span className="hint">Cover preview. Without an image a drawn cover is used.</span>
        </div>
        {failure && <p className="alert alert-error" role="alert">{failure}</p>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save book'}</button>
          <Link to="/manage/books" className="btn">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
