import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useTitle, useToast } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import AdminNav from './AdminNav'
import Cover from '../ui/Cover'

const empty = { title: '', author: '', genre: '', language: 'English', price: '', stock: '20', pages: '', description: '', excerpt: '', image: '' }
const GENRES = ['Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'Historical Fiction', 'Science & Nature', 'Technology', 'Poetry']

function validate(f, file) {
  const e = {}
  if (!f.title.trim()) e.title = 'Title is required.'
  if (!f.author.trim()) e.author = 'Author is required.'
  const price = Number(f.price)
  if (f.price === '' || !Number.isFinite(price) || price < 0) e.price = 'Enter a price of 0 or more.'
  if (f.stock !== '' && (!Number.isInteger(Number(f.stock)) || Number(f.stock) < 0)) e.stock = 'Stock must be a whole number, 0 or more.'
  if (f.pages !== '' && (!Number.isInteger(Number(f.pages)) || Number(f.pages) < 1)) e.pages = 'Pages must be a whole number, 1 or more.'
  if (f.image && !/^https?:\/\//i.test(f.image) && !f.image.startsWith('data:image/')) e.image = 'Use a full http(s) image URL, or upload a file.'
  if (file && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) e.file = 'Cover must be a JPEG, PNG, WebP or GIF image.'
  if (file && file.size > 2 * 1024 * 1024) e.file = 'Cover image must be 2MB or smaller.'
  return e
}

// Add (no :id) or edit (:id) a book. The cover is an uploaded file (<= 2MB image) or an image URL.
export default function BookForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  useTitle(id ? 'Edit book' : 'Add book')
  const [form, setForm] = useState(empty)
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
          title: b.title || '',
          author: b.author || '',
          genre: b.genre || '',
          language: b.language || '',
          price: String(b.price ?? ''),
          stock: String(b.stock ?? ''),
          pages: b.pages ? String(b.pages) : '',
          description: b.description || '',
          excerpt: b.excerpt || '',
          image: b.image && !b.image.startsWith('/uploads/') && !b.image.startsWith('data:') ? b.image : '',
        })
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
  const preview = fileUrl || form.image || serverImage

  const bind = (k) => ({
    id: `f-${k}`,
    className: 'input',
    value: form[k],
    onChange: (e) => setForm({ ...form, [k]: e.target.value }),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `f-${k}-err` : undefined,
  })
  const err = (k) => (errors[k] ? <span className="err" id={`f-${k}-err`}>{errors[k]}</span> : null)

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate(form, file)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries(form)) {
        if (k === 'image' && !v) continue // keep the existing cover when blank
        if (v !== '') fd.append(k, v)
      }
      if (file) fd.append('cover', file)
      await api(id ? `/api/books/${id}` : '/api/books', { method: id ? 'PUT' : 'POST', body: fd })
      toast.success(id ? 'Book updated.' : 'Book added.')
      navigate('/admin/books')
    } catch (err) {
      setFailure(err.message)
      setBusy(false)
    }
  }

  if (loadError) return <div className="container page"><ErrorState message={loadError} /></div>
  if (loading) return <PageSkeleton />

  return (
    <div className="container page">
      <h1>{id ? 'Edit book' : 'Add a book'}</h1>
      <AdminNav />
      <form className="card" onSubmit={submit} noValidate style={{ maxWidth: 760 }}>
        <div className="grid2">
          <div className="field"><label htmlFor="f-title">Title</label><input {...bind('title')} maxLength={200} />{err('title')}</div>
          <div className="field"><label htmlFor="f-author">Author</label><input {...bind('author')} maxLength={120} />{err('author')}</div>
          <div className="field">
            <label htmlFor="f-genre">Genre</label>
            <input {...bind('genre')} list="genre-list" maxLength={60} />
            <datalist id="genre-list">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="field"><label htmlFor="f-language">Language</label><input {...bind('language')} maxLength={40} /></div>
          <div className="field"><label htmlFor="f-price">Price (USD)</label><input {...bind('price')} type="number" step="0.01" min="0" inputMode="decimal" />{err('price')}</div>
          <div className="field"><label htmlFor="f-stock">Stock</label><input {...bind('stock')} type="number" min="0" />{err('stock')}</div>
          <div className="field"><label htmlFor="f-pages">Pages</label><input {...bind('pages')} type="number" min="1" />{err('pages')}</div>
        </div>
        <div className="field"><label htmlFor="f-description">Description</label><textarea {...bind('description')} maxLength={2000} rows={4} /></div>
        <div className="field"><label htmlFor="f-excerpt">Preview excerpt</label><textarea {...bind('excerpt')} maxLength={4000} rows={6} /><span className="hint">Shown as the "Read a preview" sample on the book page.</span></div>
        <div className="grid2">
          <div className="field"><label htmlFor="f-image">Cover image URL</label><input {...bind('image')} type="url" placeholder="https://example.com/cover.jpg" />{err('image')}</div>
          <div className="field">
            <label htmlFor="f-file">...or upload a cover (max 2MB)</label>
            <input id="f-file" className="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-invalid={!!errors.file} onChange={(e) => setFile(e.target.files[0] || null)} />
            {err('file')}
          </div>
        </div>
        <div className="row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
          <div className="cover-preview"><Cover book={{ title: form.title || 'Untitled', author: form.author || 'Author', genre: form.genre, image: preview }} /></div>
          <span className="hint">Cover preview. Without an image a drawn cover is used.</span>
        </div>
        {failure && <p className="alert alert-error" role="alert">{failure}</p>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save book'}</button>
          <Link to="/admin/books" className="btn">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
