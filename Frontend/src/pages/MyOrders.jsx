import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useCart, useConfirm, useFetch, useSettings, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import Tracking from '../ui/Tracking'
import { Field, FormatIcon, Modal, StatusPill } from '../ui/Parts'
import { FORMAT_LABEL, RETURN_REASONS, fmtDate, money, shortId } from '../lib/format'
import { isDigital, isPhysical } from '../shared/rules.mjs'

function ReturnDialog({ order, onClose, onDone }) {
  const toast = useToast()
  const settings = useSettings()
  const lines = order.items.filter((i) => i.kind !== 'giftcard' && isPhysical(i.format || 'paperback'))
  const [qty, setQty] = useState({})
  const [reason, setReason] = useState('damaged')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = lines.filter((l) => (qty[l.book] || 0) > 0)
  const submit = async (e) => {
    e.preventDefault()
    if (!chosen.length) return setError('Choose at least one item to return.')
    setBusy(true)
    setError('')
    try {
      await api(`/api/orders/${order._id}/returns`, { method: 'POST', body: { items: chosen.map((l) => ({ book: l.book, format: l.format, qty: qty[l.book] })), reason, note } })
      toast.success('Return request sent. We will review it shortly.')
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="small muted">{settings.returns.restockingNote} Digital items cannot be returned. {order.returnDaysLeft} day{order.returnDaysLeft === 1 ? '' : 's'} left in the return window.</p>
      <fieldset className="choice-group">
        <legend>What would you like to return?</legend>
        {lines.map((l) => {
          const max = l.qty - (l.returnedQty || 0)
          return (
            <div className="row between" key={`${l.book}-${l.format}`}>
              <span>{l.title} <span className="muted small">({FORMAT_LABEL[l.format || 'paperback']}, bought {l.qty})</span></span>
              <label className="row small" style={{ gap: 6 }}>
                Quantity
                <input className="input" style={{ width: 70, minHeight: 34 }} type="number" min="0" max={max} value={qty[l.book] || 0} onChange={(e) => setQty({ ...qty, [l.book]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) })} />
              </label>
            </div>
          )
        })}
      </fieldset>
      <Field label="Reason" as="select" value={reason} onChange={(e) => setReason(e.target.value)}>
        {RETURN_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Field>
      <Field label="Anything we should know? (optional)" as="textarea" maxLength={400} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Request return'}</button>
      </div>
    </form>
  )
}

export default function MyOrders() {
  useTitle('My orders')
  const { data, error, loading, reload } = useFetch('/api/orders/mine')
  const { addLines } = useCart()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState('')
  const [returning, setReturning] = useState(null)
  const reorder = async (order) => {
    setBusyId(order._id)
    try {
      const { items, unavailable } = await api(`/api/orders/${order._id}/reorder`, { method: 'POST' })
      if (items.length) addLines(items)
      if (unavailable.length) toast.info(`Not available right now: ${unavailable.join(', ')}.`)
      if (items.length) {
        toast.success("Books added to your cart at today's prices.")
        navigate('/cart')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId('')
    }
  }
  const cancel = async (order) => {
    if (!(await confirm({ title: 'Cancel this order?', message: 'Stock, coupons, gift card balance and points are restored. This cannot be undone.', confirmLabel: 'Cancel order', cancelLabel: 'Keep order', danger: true }))) return
    try {
      await api(`/api/orders/${order._id}/cancel`, { method: 'POST' })
      toast.success('Order cancelled.')
      window.dispatchEvent(new Event('folio:notifications'))
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (loading && !data) return <PageSkeleton />
  return (
    <div className="container page">
      <div className="row between">
        <h1>My orders</h1>
        <Link to="/returns" className="btn btn-sm">My returns</Link>
      </div>
      {data.length === 0 ? (
        <EmptyState title="No orders yet" text="When you place an order it will show up here, with tracking." to="/books" action="Start browsing" />
      ) : (
        data.map((o) => (
          <article className="card order" key={o._id} aria-label={`Order ${shortId(o._id)}`}>
            <div className="order-head">
              <div>
                <strong>Order #{shortId(o._id)}</strong>
                <div className="small muted">Placed {fmtDate(o.createdAt)}</div>
              </div>
              <StatusPill status={o.status} />
              <strong>{money(o.total)}</strong>
            </div>
            {o.items.some((i) => i.kind === 'giftcard') && o.items.every((i) => i.kind === 'giftcard') ? null : <Tracking status={o.status} />}
            <ul className="order-items">
              {o.items.map((i, k) => (
                <li key={`${i.book || i.code}-${k}`}>
                  {i.kind === 'giftcard' ? (
                    <span>Gift card {money(i.price)} {i.code && <span className="mono pill">{i.code}</span>}</span>
                  ) : (
                    <>
                      <Link to={`/books/${i.book}`}>{i.title}</Link> <span className="pill"><FormatIcon type={i.format || 'paperback'} /> {FORMAT_LABEL[i.format || 'paperback']}</span> x {i.qty} <span className="muted">({money(i.price)})</span>
                      {i.preorder && o.status === 'preorder' && <span className="pill pill-accent" style={{ marginLeft: 6 }}>Pre-order</span>}
                      {i.returnedQty > 0 && <span className="pill" style={{ marginLeft: 6 }}>{i.returnedQty} returned</span>}
                      {isDigital(i.format) && o.status === 'delivered' && <Link className="btn btn-ghost btn-sm" to={i.format === 'ebook' ? `/read/${i.book}` : `/listen/${i.book}`}>{i.format === 'ebook' ? 'Read' : 'Listen'}</Link>}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {o.bundleDiscount > 0 && <p className="small discount">Box set discount saved {money(o.bundleDiscount)}.</p>}
            {o.discount > 0 && <p className="small discount">Coupon {o.couponCode} saved you {money(o.discount)}.</p>}
            {o.pointsUsed > 0 && <p className="small discount">{o.pointsUsed} reward points saved {money(o.pointsDiscount)}.</p>}
            {o.gift?.message && <p className="small">Gift message: &ldquo;{o.gift.message}&rdquo;{o.gift.wrap ? ' (gift wrapped)' : ''}</p>}
            {o.refundedTotal > 0 && <p className="small">Refunded so far: {money(o.refundedTotal)}</p>}
            {o.returns?.length > 0 && <p className="small">Returns: {o.returns.map((r) => <StatusPill key={r._id} status={r.status} />)}</p>}
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => reorder(o)} disabled={busyId === o._id}>{busyId === o._id ? 'Adding...' : 'Reorder'}</button>
              <Link className="btn btn-sm" to={`/orders/${o._id}/invoice`}>Invoice</Link>
              {o.returnable && <button type="button" className="btn btn-sm" onClick={() => setReturning(o)}>Return items</button>}
              {o.canCancel && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => cancel(o)}>Cancel order</button>}
            </div>
          </article>
        ))
      )}
      <Modal open={!!returning} onClose={() => setReturning(null)} title="Return items">
        {returning && <ReturnDialog order={returning} onClose={() => setReturning(null)} onDone={() => (setReturning(null), reload())} />}
      </Modal>
    </div>
  )
}
