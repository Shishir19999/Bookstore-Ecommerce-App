import { useState } from 'react'
import { api } from '../api'
import { useConfirm, useFetch, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import AdminNav from './AdminNav'
import { fmtDate, money } from '../lib/format'

const blank = { code: '', type: 'percent', value: '', minSubtotal: '', usageLimit: '', expiresAt: '', description: '' }

const status = (c) => {
  if (!c.active) return ['Disabled', '']
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return ['Expired', 'pill-danger']
  if (c.usageLimit && c.used >= c.usageLimit) return ['Used up', 'pill-warn']
  return ['Active', 'pill-success']
}

function validate(f) {
  const e = {}
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(f.code.trim())) e.code = 'Use 3-30 letters, digits, - or _.'
  const v = Number(f.value)
  if (!Number.isFinite(v) || v <= 0) e.value = 'Enter a value above 0.'
  else if (f.type === 'percent' && v > 100) e.value = 'A percentage cannot exceed 100.'
  if (f.minSubtotal !== '' && Number(f.minSubtotal) < 0) e.minSubtotal = 'Cannot be negative.'
  if (f.usageLimit !== '' && (!Number.isInteger(Number(f.usageLimit)) || Number(f.usageLimit) < 0)) e.usageLimit = 'Use a whole number, 0 for unlimited.'
  return e
}

export default function Coupons() {
  useTitle('Manage coupons')
  const { data, error, reload } = useFetch('/api/admin/coupons')
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const bind = (k) => ({
    id: `c-${k}`,
    className: 'input',
    value: form[k],
    onChange: (e) => setForm({ ...form, [k]: e.target.value }),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `c-${k}-err` : undefined,
  })
  const err = (k) => (errors[k] ? <span className="err" id={`c-${k}-err`}>{errors[k]}</span> : null)

  const create = async (e) => {
    e.preventDefault()
    const errs = validate(form)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await api('/api/admin/coupons', {
        method: 'POST',
        body: { ...form, code: form.code.trim(), expiresAt: form.expiresAt ? new Date(form.expiresAt + 'T23:59:59').toISOString() : null },
      })
      toast.success(`Coupon ${form.code.trim().toUpperCase()} created.`)
      setForm(blank)
      reload()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (c) => {
    try {
      await api(`/api/admin/coupons/${c._id}`, { method: 'PUT', body: { active: !c.active } })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const remove = async (c) => {
    if (!(await confirm({ title: `Delete coupon ${c.code}?`, message: 'Customers will no longer be able to use it.', confirmLabel: 'Delete', danger: true }))) return
    try {
      await api(`/api/admin/coupons/${c._id}`, { method: 'DELETE' })
      toast.success('Coupon deleted.')
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="container page">
      <h1>Coupons</h1>
      <AdminNav />
      <form className="card" onSubmit={create} noValidate style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: '1.2rem' }}>New coupon</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="c-code">Code</label><input {...bind('code')} maxLength={30} placeholder="SPRING15" />{err('code')}</div>
          <div className="field">
            <label htmlFor="c-type">Type</label>
            <select {...bind('type')}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select>
          </div>
          <div className="field"><label htmlFor="c-value">{form.type === 'percent' ? 'Percent' : 'Amount (USD)'}</label><input {...bind('value')} type="number" step="0.01" min="0" />{err('value')}</div>
          <div className="field"><label htmlFor="c-minSubtotal">Minimum subtotal</label><input {...bind('minSubtotal')} type="number" step="0.01" min="0" />{err('minSubtotal')}</div>
          <div className="field"><label htmlFor="c-usageLimit">Usage limit (0 = unlimited)</label><input {...bind('usageLimit')} type="number" min="0" />{err('usageLimit')}</div>
          <div className="field"><label htmlFor="c-expiresAt">Expires on</label><input {...bind('expiresAt')} type="date" /></div>
        </div>
        <div className="field"><label htmlFor="c-description">Description</label><input {...bind('description')} maxLength={200} /></div>
        {failure && <p className="alert alert-error" role="alert">{failure}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Create coupon'}</button>
      </form>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton />
      ) : data.length === 0 ? (
        <EmptyState title="No coupons yet" text="Create one above." />
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Coupons</caption>
            <thead><tr><th>Code</th><th>Discount</th><th className="num">Min spend</th><th className="num">Used</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {data.map((c) => {
                const [label, cls] = status(c)
                return (
                  <tr key={c._id}>
                    <td><strong>{c.code}</strong><div className="small muted">{c.description}</div></td>
                    <td>{c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
                    <td className="num">{money(c.minSubtotal)}</td>
                    <td className="num">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td>{c.expiresAt ? fmtDate(c.expiresAt) : 'Never'}</td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button type="button" className="btn btn-sm" onClick={() => toggle(c)}>{c.active ? 'Disable' : 'Enable'}</button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
