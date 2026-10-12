import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useConfirm, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Field, Modal, Panel, Tabs } from '../ui/Parts'
import ManageNav from './ManageNav'
import { fmtDateTime, money } from '../lib/format'
import { EVENT_TYPES } from '../shared/rules.mjs'

// Search-and-tick picker for a list of books (collections and box sets).
function BookPicker({ selected, setSelected }) {
  const [q, setQ] = useState('')
  const { data } = useFetch(`/api/books?search=${encodeURIComponent(q)}&limit=8&sort=title`)
  const toggle = (b) => setSelected(selected.some((s) => s._id === b._id) ? selected.filter((s) => s._id !== b._id) : [...selected, { _id: b._id, title: b.title }])
  return (
    <fieldset className="choice-group">
      <legend>Books ({selected.length} chosen)</legend>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {selected.map((s) => <button key={s._id} type="button" className="chip on" onClick={() => toggle(s)} aria-label={`Remove ${s.title}`}>{s.title} &times;</button>)}
      </div>
      <label className="sr-only" htmlFor="bp-q">Search books to add</label>
      <input id="bp-q" className="input" type="search" placeholder="Search books to add" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pick-list">
        {(data?.books || []).map((b) => (
          <label key={b._id} className="choice"><input type="checkbox" checked={selected.some((s) => s._id === b._id)} onChange={() => toggle(b)} /><span>{b.title} <span className="muted small">by {b.author}</span></span></label>
        ))}
      </div>
    </fieldset>
  )
}

function useCrud(path, reload) {
  const toast = useToast()
  const confirm = useConfirm()
  const save = async (id, body, msg) => {
    try {
      await api(id ? `${path}/${id}` : path, { method: id ? 'PUT' : 'POST', body })
      toast.success(msg)
      reload()
      return true
    } catch (err) {
      toast.error(err.message)
      return false
    }
  }
  const remove = async (id, label) => {
    if (!(await confirm({ title: `Delete ${label}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try {
      await api(`${path}/${id}`, { method: 'DELETE' })
      toast.success('Deleted.')
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return { save, remove }
}

function Authors() {
  const { data, error, reload } = useFetch('/api/staff/authors')
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api(`/api/staff/authors/${edit.slug}`, { method: 'PUT', body: { bio: edit.bio, born: edit.born, location: edit.location, website: edit.website } })
      toast.success('Author profile saved.')
      setEdit(null)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  return (
    <div className="card table-wrap" style={{ padding: 0, marginTop: 16 }}>
      <table className="table">
        <caption className="sr-only">Authors</caption>
        <thead><tr><th>Author</th><th className="num">Books</th><th className="num">Followers</th><th>Profile</th><th>Actions</th></tr></thead>
        <tbody>{data.map((a) => <tr key={a.slug}><td><strong>{a.name}</strong></td><td className="num">{a.bookCount}</td><td className="num">{a.followers}</td><td className="small">{a.bio ? `${a.bio.slice(0, 70)}...` : <span className="muted">No bio</span>}</td><td><button type="button" className="btn btn-sm" onClick={() => setEdit({ ...a })}>Edit profile</button></td></tr>)}</tbody>
      </table>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Profile: ${edit.name}` : ''}>
        {edit && (
          <form onSubmit={submit} noValidate>
            <Field label="Bio" as="textarea" rows={5} maxLength={1200} value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} />
            <div className="grid2">
              <Field label="Location" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} maxLength={80} />
              <Field label="Born (optional)" value={edit.born} onChange={(e) => setEdit({ ...edit, born: e.target.value })} maxLength={40} />
            </div>
            <Field label="Website" type="url" value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} placeholder="https://" />
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary">Save</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

const blankEvent = { title: '', author: '', type: 'reading', startsAt: '', location: 'Folio Books, 12 Quill Lane', online: false, capacity: '0', description: '' }
function Events() {
  const { data, error, reload } = useFetch('/api/staff/events')
  const authors = useFetch('/api/staff/authors')
  const { save, remove } = useCrud('/api/staff/events', reload)
  const [edit, setEdit] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...edit, startsAt: edit.startsAt ? new Date(edit.startsAt).toISOString() : '', capacity: Number(edit.capacity) || 0 }
    delete body._id
    delete body.going
    delete body.rsvps
    delete body.authorSlug
    delete body.createdAt
    if (await save(edit._id, body, edit._id ? 'Event updated.' : 'Event created; followers were notified.')) setEdit(null)
  }
  const toLocal = (iso) => {
    const d = new Date(iso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="btn btn-primary" onClick={() => setEdit({ ...blankEvent })}>New event</button>
      {data.length === 0 ? <EmptyState title="No events" /> : (
        <div className="card table-wrap" style={{ padding: 0, marginTop: 12 }}>
          <table className="table">
            <caption className="sr-only">Events</caption>
            <thead><tr><th>Event</th><th>When</th><th>Where</th><th className="num">Going</th><th>Actions</th></tr></thead>
            <tbody>{data.map((ev) => <tr key={ev._id}><td><strong>{ev.title}</strong><div className="small muted">{ev.author} &middot; {ev.type}</div></td><td>{fmtDateTime(ev.startsAt)}</td><td>{ev.online ? 'Online' : ev.location}</td><td className="num">{ev.going}{ev.capacity ? ` / ${ev.capacity}` : ''}</td><td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button type="button" className="btn btn-sm" onClick={() => setEdit({ ...ev, startsAt: toLocal(ev.startsAt), capacity: String(ev.capacity || 0) })}>Edit</button><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(ev._id, `"${ev.title}"`)}>Delete</button></div></td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit event' : 'New event'} wide>
        {edit && (
          <form onSubmit={submit} noValidate>
            <Field label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} />
            <div className="grid2">
              <Field label="Author" value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} list="ev-authors" hint="Followers of this author are notified." />
              <datalist id="ev-authors">{(authors.data || []).map((a) => <option key={a.slug} value={a.name} />)}</datalist>
              <Field label="Type" as="select" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Field>
              <Field label="Starts" type="datetime-local" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} />
              <Field label="Capacity (0 = unlimited)" type="number" min="0" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} />
            </div>
            <Field label="Location" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} maxLength={160} />
            <label className="row small"><input type="checkbox" checked={!!edit.online} onChange={(e) => setEdit({ ...edit, online: e.target.checked })} /> Online event</label>
            <Field label="Description" as="textarea" rows={3} maxLength={800} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary">Save event</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function Collections() {
  const { data, error, reload } = useFetch('/api/collections')
  const { save, remove } = useCrud('/api/staff/collections', reload)
  const [edit, setEdit] = useState(null)
  const open = async (c) => {
    if (!c) return setEdit({ title: '', blurb: '', featured: false, books: [] })
    const full = await api(`/api/collections/${c.slug}`)
    setEdit({ _id: c._id, title: c.title, blurb: c.blurb, featured: !!c.featured, books: full.books.map((b) => ({ _id: b._id, title: b.title })) })
  }
  const submit = async (e) => {
    e.preventDefault()
    if (await save(edit._id, { title: edit.title, blurb: edit.blurb, featured: edit.featured, bookIds: edit.books.map((b) => b._id) }, 'Collection saved.')) setEdit(null)
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="btn btn-primary" onClick={() => open(null)}>New collection</button>
      <div className="card table-wrap" style={{ padding: 0, marginTop: 12 }}>
        <table className="table">
          <caption className="sr-only">Collections</caption>
          <thead><tr><th>Collection</th><th className="num">Books</th><th>On home page</th><th>Actions</th></tr></thead>
          <tbody>{data.collections.map((c) => <tr key={c._id}><td><strong>{c.title}</strong><div className="small muted">{c.blurb}</div></td><td className="num">{c.count}</td><td>{c.featured ? 'Yes' : 'No'}</td><td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button type="button" className="btn btn-sm" onClick={() => open(c)}>Edit</button><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(c._id, `"${c.title}"`)}>Delete</button></div></td></tr>)}</tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit collection' : 'New collection'} wide>
        {edit && (
          <form onSubmit={submit} noValidate>
            <Field label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={80} />
            <Field label="Blurb" value={edit.blurb} onChange={(e) => setEdit({ ...edit, blurb: e.target.value })} maxLength={300} />
            <label className="row small"><input type="checkbox" checked={edit.featured} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /> Show on the home page</label>
            <BookPicker selected={edit.books} setSelected={(books) => setEdit({ ...edit, books })} />
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary">Save</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function Bundles() {
  const { data, error, reload } = useFetch('/api/bundles')
  const { save, remove } = useCrud('/api/staff/bundles', reload)
  const [edit, setEdit] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    if (await save(edit._id, { title: edit.title, description: edit.description, discountPct: Number(edit.discountPct), bookIds: edit.books.map((b) => b._id) }, 'Box set saved.')) setEdit(null)
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="btn btn-primary" onClick={() => setEdit({ title: '', description: '', discountPct: '15', books: [] })}>New box set</button>
      <div className="card table-wrap" style={{ padding: 0, marginTop: 12 }}>
        <table className="table">
          <caption className="sr-only">Box sets</caption>
          <thead><tr><th>Box set</th><th className="num">Books</th><th className="num">Discount</th><th className="num">Set price</th><th>Actions</th></tr></thead>
          <tbody>{data.bundles.map((b) => <tr key={b._id}><td><strong>{b.title}</strong></td><td className="num">{b.books.length}</td><td className="num">{b.discountPct}%</td><td className="num">{money(b.price)} <span className="small muted">({money(b.listPrice)})</span></td><td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button type="button" className="btn btn-sm" onClick={() => setEdit({ _id: b._id, title: b.title, description: b.description, discountPct: String(b.discountPct), books: b.books.map((x) => ({ _id: x._id, title: x.title })) })}>Edit</button><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(b._id, `"${b.title}"`)}>Delete</button></div></td></tr>)}</tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit box set' : 'New box set'} wide>
        {edit && (
          <form onSubmit={submit} noValidate>
            <Field label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={80} />
            <Field label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={400} />
            <Field label="Discount (percent off the paperbacks)" type="number" min="1" max="60" value={edit.discountPct} onChange={(e) => setEdit({ ...edit, discountPct: e.target.value })} />
            <BookPicker selected={edit.books} setSelected={(books) => setEdit({ ...edit, books })} />
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary">Save</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function SeriesTab() {
  const { data, error, reload } = useFetch('/api/series')
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api(`/api/staff/series/${edit.slug}`, { method: 'PUT', body: { description: edit.description } })
      toast.success('Series description saved.')
      setEdit(null)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  return (
    <div className="card table-wrap" style={{ padding: 0, marginTop: 16 }}>
      <p className="small muted" style={{ padding: '12px 16px 0' }}>Series are created by giving books a series name and number in the book form. Here you can write the description shown on the series page.</p>
      <table className="table">
        <caption className="sr-only">Series</caption>
        <thead><tr><th>Series</th><th>Author</th><th className="num">Books</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>{data.series.map((s) => <tr key={s.slug}><td><strong>{s.name}</strong></td><td>{s.author}</td><td className="num">{s.count}</td><td className="small">{s.description || <span className="muted">None</span>}</td><td><button type="button" className="btn btn-sm" onClick={() => setEdit({ ...s })}>Edit</button></td></tr>)}</tbody>
      </table>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Series: ${edit.name}` : ''}>
        {edit && <form onSubmit={submit}><Field label="Description" as="textarea" rows={4} maxLength={600} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /><div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary">Save</button></div></form>}
      </Modal>
    </div>
  )
}

export default function Catalog() {
  useTitle('Catalogue extras')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'events'
  return (
    <div className="container page">
      <h1>Catalogue extras</h1>
      <ManageNav />
      <Tabs tabs={[{ id: 'events', label: 'Events' }, { id: 'authors', label: 'Author profiles' }, { id: 'collections', label: 'Collections' }, { id: 'bundles', label: 'Box sets' }, { id: 'series', label: 'Series' }]} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} label="Catalogue extras" />
      <Panel id={tab}>
        {tab === 'events' && <Events />}
        {tab === 'authors' && <Authors />}
        {tab === 'collections' && <Collections />}
        {tab === 'bundles' && <Bundles />}
        {tab === 'series' && <SeriesTab />}
      </Panel>
      <p className="small muted" style={{ marginTop: 14 }}>Followers are notified automatically when you add a book or event for an author they follow.</p>
    </div>
  )
}
