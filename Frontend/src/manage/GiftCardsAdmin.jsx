import { useState } from 'react'
import { api } from '../api'
import { useFetch, useSettings, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Field, Modal } from '../ui/Parts'
import ManageNav from './ManageNav'
import { fmtDate, money } from '../lib/format'

export default function GiftCardsAdmin() {
  useTitle('Gift cards')
  const settings = useSettings()
  const toast = useToast()
  const { data, error, reload } = useFetch('/api/admin/giftcards')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: '25', toEmail: '', note: '' })
  const [formErr, setFormErr] = useState('')
  const issue = async (e) => {
    e.preventDefault()
    setFormErr('')
    try {
      const c = await api('/api/admin/giftcards', { method: 'POST', body: { ...form, amount: Number(form.amount) } })
      toast.success(`Gift card ${c.code} issued.`)
      setOpen(false)
      reload()
    } catch (err) {
      setFormErr(err.message)
    }
  }
  const toggle = async (c) => {
    try {
      await api(`/api/admin/giftcards/${c._id}`, { method: 'PATCH', body: { disabled: !c.disabled } })
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const outstanding = (data || []).filter((c) => !c.disabled).reduce((s, c) => s + c.balance, 0)
  return (
    <div className="container page">
      <div className="row between"><h1>Gift cards</h1><button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Issue a gift card</button></div>
      <ManageNav />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : data.length === 0 ? <EmptyState title="No gift cards yet" /> : (
        <>
          <p className="muted">Outstanding balance on active cards: <strong>{money(outstanding)}</strong>.</p>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="table">
              <caption className="sr-only">Gift cards</caption>
              <thead><tr><th scope="col">Code</th><th scope="col" className="num">Balance</th><th scope="col" className="num">Original</th><th scope="col">Recipient</th><th scope="col">Issued</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c._id}>
                    <td className="mono">{c.code}{c.complimentary && <span className="pill" style={{ marginLeft: 6 }}>Complimentary</span>}</td>
                    <td className="num">{money(c.balance)}</td><td className="num">{money(c.initial)}</td>
                    <td>{c.toName || c.toEmail || <span className="muted">-</span>}</td><td>{fmtDate(c.createdAt)}</td>
                    <td><span className={`pill ${c.disabled ? 'pill-danger' : c.balance === 0 ? '' : 'pill-success'}`}>{c.disabled ? 'Disabled' : c.balance === 0 ? 'Used up' : 'Active'}</span></td>
                    <td><button type="button" className="btn btn-sm" onClick={() => toggle(c)}>{c.disabled ? 'Enable' : 'Disable'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Issue a complimentary gift card">
        <form onSubmit={issue} noValidate>
          <Field label={`Amount (${money(settings.giftCards.min)} to ${money(settings.giftCards.max)})`} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} error={formErr} />
          <Field label="Recipient email (optional)" type="email" value={form.toEmail} onChange={(e) => setForm({ ...form, toEmail: e.target.value })} hint="If an account has this email it is notified." />
          <Field label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} />
          <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary">Issue</button></div>
        </form>
      </Modal>
    </div>
  )
}
