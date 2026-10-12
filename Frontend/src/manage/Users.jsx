import { useState } from 'react'
import { useAuth, useFetch, useTitle, useToast } from '../hooks'
import { api, downloadCsv } from '../api'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Field, Modal, Pager } from '../ui/Parts'
import ManageNav from './ManageNav'
import { fmtDate } from '../lib/format'
import { ROLES, ROLE_LABEL } from '../shared/rules.mjs'

export default function Users() {
  useTitle('Manage users')
  const { user: me } = useAuth()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const query = new URLSearchParams({ page, limit: 12 })
  if (applied) query.set('q', applied)
  if (role) query.set('role', role)
  const { data, error, reload } = useFetch(`/api/admin/users?${query}`)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' })
  const [formErr, setFormErr] = useState('')
  const [points, setPoints] = useState(null)
  const patch = async (u, body, msg) => {
    try {
      await api(`/api/admin/users/${u._id}`, { method: 'PATCH', body })
      toast.success(msg)
      reload()
    } catch (err) {
      toast.error(err.message)
      reload()
    }
  }
  const create = async (e) => {
    e.preventDefault()
    setFormErr('')
    try {
      await api('/api/admin/users', { method: 'POST', body: form })
      toast.success(`${ROLE_LABEL[form.role]} account created for ${form.email}.`)
      setCreating(false)
      setForm({ name: '', email: '', password: '', role: 'staff' })
      reload()
    } catch (err) {
      setFormErr(err.message)
    }
  }
  const adjust = async (e) => {
    e.preventDefault()
    try {
      await api(`/api/admin/users/${points.u._id}/points`, { method: 'POST', body: { delta: Number(points.delta), note: points.note } })
      toast.success('Points adjusted.')
      setPoints(null)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <div className="container page">
      <div className="row between">
        <h1>Users</h1>
        <div className="row">
          <button type="button" className="btn" onClick={() => downloadCsv('/api/export/users.csv', 'customers.csv').catch((e) => toast.error(e.message))}>Export CSV</button>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>New account</button>
        </div>
      </div>
      <ManageNav />
      <div className="row" style={{ marginBottom: 14 }}>
        <form className="row" role="search" onSubmit={(e) => (e.preventDefault(), setApplied(q.trim()), setPage(1))}>
          <label className="sr-only" htmlFor="u-q">Search users</label>
          <input id="u-q" className="input" style={{ maxWidth: 260 }} placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-sm">Search</button>
        </form>
        <label className="row small" style={{ gap: 6 }}>Role
          <select className="input" style={{ width: 'auto', minHeight: 36 }} value={role} onChange={(e) => (setRole(e.target.value), setPage(1))}>
            <option value="">All</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.users.length === 0 ? <EmptyState title="No users found" /> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Users</caption>
            <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Tier</th><th scope="col" className="num">Points</th><th scope="col" className="num">Orders</th><th scope="col">Joined</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {data.users.map((u) => {
                const self = u._id === me.id
                return (
                  <tr key={u._id}>
                    <td><strong>{u.name}</strong> {u.disabled && <span className="pill pill-danger">Disabled</span>}<div className="small muted">{u.email}</div></td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${u._id}`}>Role of {u.name}</label>
                      <select id={`role-${u._id}`} className="input" style={{ minHeight: 34, width: 'auto' }} value={u.role} disabled={self} onChange={(e) => patch(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value].toLowerCase()}.`)}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td><span className="pill">{u.tier}</span></td>
                    <td className="num">{u.points}</td>
                    <td className="num">{u.orders}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button type="button" className="btn btn-sm" onClick={() => setPoints({ u, delta: '100', note: '' })}>Points</button>
                        {!self && <button type="button" className={`btn btn-sm ${u.disabled ? '' : 'btn-outline-danger'}`} onClick={() => patch(u, { disabled: !u.disabled }, u.disabled ? 'Account enabled.' : 'Account disabled and signed out everywhere.')}>{u.disabled ? 'Enable' : 'Disable'}</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      <Modal open={creating} onClose={() => setCreating(false)} title="New account">
        <form onSubmit={create} noValidate>
          <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
          <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Field label="Temporary password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="At least 6 characters." />
          <Field label="Role" as="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Field>
          {formErr && <p className="err" role="alert">{formErr}</p>}
          <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn btn-primary">Create account</button></div>
        </form>
      </Modal>
      <Modal open={!!points} onClose={() => setPoints(null)} title={points ? `Adjust points: ${points.u.name}` : ''}>
        {points && (
          <form onSubmit={adjust} noValidate>
            <Field label="Points to add (negative to remove)" type="number" value={points.delta} onChange={(e) => setPoints({ ...points, delta: e.target.value })} hint={`Current balance: ${points.u.points}`} />
            <Field label="Note (shown to the customer)" value={points.note} onChange={(e) => setPoints({ ...points, note: e.target.value })} maxLength={120} />
            <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setPoints(null)}>Cancel</button><button className="btn btn-primary">Apply</button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}
