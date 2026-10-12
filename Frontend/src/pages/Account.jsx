import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useCart, useFetch, useSettings, useTitle, useToast } from '../hooks'
import { EmptyState, ErrorState, PageSkeleton } from '../ui/States'
import { Field, Panel, Ring, Tabs } from '../ui/Parts'
import { fmtDate, money, plural, timeAgo } from '../lib/format'

const TIER_TEXT = {
  bronze: 'Earn 1 point for every dollar you spend.',
  silver: 'Earn 25% bonus points on every order.',
  gold: 'Earn 50% bonus points and enjoy free standard shipping on every order.',
}

function Profile() {
  const { user } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [country, setCountry] = useState(user.country || 'US')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/me/profile', { method: 'PUT', body: { name, country } })
      toast.success('Profile saved. Changes show everywhere after your next page load.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card" onSubmit={save} noValidate style={{ maxWidth: 520, marginTop: 16 }}>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <Field label="Email" value={user.email} readOnly hint="Your login. Contact the shop to change it." />
      <Field label="Default delivery country" as="select" value={country} onChange={(e) => setCountry(e.target.value)} hint="Used to estimate shipping and tax.">
        {(settings.countries || []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </Field>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
    </form>
  )
}

function Rewards() {
  const { data, error, reload } = useFetch('/api/me/loyalty')
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  const t = data.tier
  const l = data.settings
  const next = t.next ? (t.id === 'bronze' ? l.silverAt : l.goldAt) : l.goldAt
  const from = t.id === 'bronze' ? 0 : t.id === 'silver' ? l.silverAt : l.goldAt
  return (
    <div style={{ marginTop: 16 }}>
      <div className="life-grid">
        <section className="card">
          <p className="eyebrow">Your balance</p>
          <p style={{ margin: 0 }}><span className="streak-num">{data.points}</span> <span className="muted">points = {money(data.value)}</span></p>
          <p className="small muted">100 points = $1 at checkout (up to half of an order). Lifetime points earned: {data.lifetime}.</p>
          <Link className="btn btn-sm btn-primary" to="/books">Spend points</Link>
        </section>
        <section className="card row" style={{ flexWrap: 'nowrap', gap: 18 }}>
          <Ring value={data.lifetime - from} max={Math.max(1, next - from)} label={`${t.name} member`} size={110} stroke={10}>
            <strong>{t.name}</strong>
          </Ring>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Membership</p>
            <h2 style={{ margin: '2px 0', fontSize: '1.4rem' }}>{t.name}</h2>
            <p className="small">{TIER_TEXT[t.id]}</p>
            {t.next ? <p className="small muted">{t.needed} more points to reach {t.next}.</p> : <p className="small muted">You are at the top tier.</p>}
          </div>
        </section>
      </div>
      <h2 style={{ marginTop: 24 }}>Points history</h2>
      {data.ledger.length === 0 ? <p className="muted">Earn points with every order.</p> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Points history</caption>
            <thead><tr><th>Date</th><th>Activity</th><th className="num">Points</th></tr></thead>
            <tbody>
              {data.ledger.map((e) => <tr key={e._id}><td>{fmtDate(e.createdAt)}</td><td>{e.note || e.type}</td><td className="num"><strong style={{ color: e.delta < 0 ? 'var(--danger)' : 'var(--success)' }}>{e.delta > 0 ? '+' : ''}{e.delta}</strong></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GiftCardsTab() {
  const { data, error, reload } = useFetch('/api/me/giftcards')
  const toast = useToast()
  const [code, setCode] = useState('')
  const [found, setFound] = useState(null)
  const check = async (e) => {
    e.preventDefault()
    try {
      setFound(await api('/api/giftcards/check', { method: 'POST', body: { code: code.trim().toUpperCase() } }))
    } catch (err) {
      setFound(null)
      toast.error(err.message)
    }
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row between"><h2 style={{ margin: 0 }}>Your gift cards</h2><Link to="/gift-cards" className="btn btn-sm btn-primary">Buy a gift card</Link></div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState title="No gift cards yet" text="Gift cards you buy or receive at your account email appear here." to="/gift-cards" action="Send a gift card" />}
      {data && data.length > 0 && (
        <ul className="gc-list">
          {data.map((c) => (
            <li key={c._id} className={`gc-card ${c.disabled ? 'off' : ''}`}>
              <span className="small">{c.direction === 'received' ? 'Received' : 'Purchased'} &middot; {fmtDate(c.createdAt)}</span>
              <strong className="mono">{c.code}</strong>
              <span>{money(c.balance)} <span className="muted small">of {money(c.initial)}</span>{c.disabled ? ' (disabled)' : ''}</span>
              {c.message && <span className="small muted">&ldquo;{c.message}&rdquo;</span>}
            </li>
          ))}
        </ul>
      )}
      <form className="card row" onSubmit={check} style={{ marginTop: 18, maxWidth: 520 }}>
        <label className="sr-only" htmlFor="chk">Gift card code</label>
        <input id="chk" className="input mono grow" placeholder="Check a balance: XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn btn-sm">Check</button>
        {found && <p style={{ margin: 0, flexBasis: '100%' }}>Balance: <strong>{money(found.balance)}</strong> of {money(found.initial)}</p>}
      </form>
    </div>
  )
}

function Alerts() {
  const { data, error, reload } = useFetch('/api/me/alerts')
  const toast = useToast()
  const { data: follows, reload: reloadF } = useFetch('/api/me/follows')
  const remove = async (a) => {
    await api(`/api/books/${a.book._id}/notify`, { method: 'POST', body: { format: a.format } }).catch((e) => toast.error(e.message))
    reload()
  }
  const unfollow = async (f) => {
    await api(`/api/authors/${f.author}/follow`, { method: 'DELETE' }).catch((e) => toast.error(e.message))
    reloadF()
  }
  return (
    <div style={{ marginTop: 16 }}>
      <h2>Back-in-stock alerts</h2>
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">No alerts. Out-of-stock printed books have a &ldquo;Notify me&rdquo; button.</p>}
      <ul className="plain">
        {(data || []).map((a) => <li key={a._id} className="row between card" style={{ marginBottom: 8 }}><span><Link to={`/books/${a.book._id}`}>{a.book.title}</Link> <span className="pill">{a.format}</span></span><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(a)}>Remove</button></li>)}
      </ul>
      <h2 style={{ marginTop: 24 }}>Authors you follow</h2>
      {follows && follows.length === 0 && <p className="muted">You do not follow anyone yet. Visit an <Link to="/authors">author page</Link> to follow them and hear about new books and events.</p>}
      <ul className="plain">
        {(follows || []).map((f) => <li key={f._id} className="row between card" style={{ marginBottom: 8 }}><Link to={`/authors/${encodeURIComponent(f.name)}`}>{f.name}</Link><button type="button" className="btn btn-sm" onClick={() => unfollow(f)}>Unfollow</button></li>)}
      </ul>
    </div>
  )
}

export default function Account() {
  useTitle('Account and rewards')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'rewards'
  return (
    <div className="container page">
      <p className="eyebrow">Account</p>
      <h1>Rewards, gift cards and settings</h1>
      <Tabs tabs={[{ id: 'rewards', label: 'Rewards' }, { id: 'gifts', label: 'Gift cards' }, { id: 'alerts', label: 'Alerts and follows' }, { id: 'profile', label: 'Profile' }]} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} label="Account sections" />
      <Panel id={tab}>
        {tab === 'rewards' && <Rewards />}
        {tab === 'gifts' && <GiftCardsTab />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'profile' && <Profile />}
      </Panel>
    </div>
  )
}

export function GiftCards() {
  useTitle('Gift cards')
  const settings = useSettings()
  const { addGiftCard } = useCart()
  const { user } = useAuth()
  const toast = useToast()
  const [amount, setAmount] = useState(25)
  const [custom, setCustom] = useState('')
  const [form, setForm] = useState({ toName: '', toEmail: '', message: '' })
  const [error, setError] = useState('')
  const { min, max, amounts } = settings.giftCards
  const value = custom ? Number(custom) : amount
  const submit = (e) => {
    e.preventDefault()
    if (!Number.isFinite(value) || value < min || value > max) return setError(`Choose an amount between ${money(min)} and ${money(max)}.`)
    if (form.toEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.toEmail)) return setError('Enter a valid recipient email or leave it blank.')
    addGiftCard({ amount: Math.round(value * 100) / 100, ...form })
    toast.success(`Gift card of ${money(value)} added to your cart.`)
  }
  return (
    <div className="container page">
      <div className="two-col">
        <div>
          <p className="eyebrow">Give a story</p>
          <h1>Gift cards</h1>
          <p className="muted">Delivered instantly: you receive the code on your confirmation page and in your account, and a recipient with a Folio Books account is notified automatically. Gift cards never expire and can be used on anything in the shop.</p>
          <div className="gc-preview" aria-hidden="true"><span>Folio Books</span><strong>{money(value || 0)}</strong><small>Gift card</small></div>
        </div>
        <form className="card" onSubmit={submit} noValidate>
          <fieldset className="choice-group">
            <legend>Amount</legend>
            <div className="row">
              {amounts.map((a) => <button key={a} type="button" className="chip" aria-pressed={!custom && amount === a} onClick={() => (setAmount(a), setCustom(''), setError(''))}>{money(a)}</button>)}
            </div>
          </fieldset>
          <Field label={`Or a custom amount (${money(min)} to ${money(max)})`} type="number" min={min} max={max} value={custom} onChange={(e) => (setCustom(e.target.value), setError(''))} />
          <Field label="Recipient name (optional)" value={form.toName} onChange={(e) => setForm({ ...form, toName: e.target.value })} maxLength={80} />
          <Field label="Recipient email (optional)" type="email" value={form.toEmail} onChange={(e) => setForm({ ...form, toEmail: e.target.value })} hint="If they have an account with this email, the card appears there. No email is sent." />
          <Field label="Message (optional)" as="textarea" rows={3} maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn btn-primary">Add to cart</button>
          {!user && <p className="hint">You will log in or register at checkout.</p>}
        </form>
      </div>
    </div>
  )
}

export function Notifications() {
  useTitle('Notifications')
  const { data, error, reload } = useFetch('/api/me/notifications')
  const toast = useToast()
  const act = async (path, method, body) => {
    try {
      await api(path, { method, body })
      window.dispatchEvent(new Event('folio:notifications'))
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>
  if (!data) return <PageSkeleton />
  return (
    <div className="container page" style={{ maxWidth: 800 }}>
      <div className="row between">
        <h1>Notifications</h1>
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={!data.unread} onClick={() => act('/api/me/notifications/read', 'POST', { all: true })}>Mark all as read</button>
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={!data.items.length} onClick={() => act('/api/me/notifications', 'DELETE')}>Clear all</button>
        </div>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="Nothing new" text="Order updates, back-in-stock alerts, new books from authors you follow and club news appear here." />
      ) : (
        <ul className="notif-list">
          {data.items.map((n) => (
            <li key={n._id} className={`card notif ${n.read ? '' : 'unread'}`}>
              <div className="grow">
                <strong>{n.title}</strong>
                {n.body && <p className="small" style={{ margin: '2px 0' }}>{n.body}</p>}
                <span className="small muted">{timeAgo(n.createdAt)}</span>
              </div>
              <div className="row">
                {n.link && <Link className="btn btn-sm" to={n.link} onClick={() => !n.read && act('/api/me/notifications/read', 'POST', { ids: [n._id] })}>Open</Link>}
                {!n.read && <button type="button" className="btn btn-ghost btn-sm" onClick={() => act('/api/me/notifications/read', 'POST', { ids: [n._id] })}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">{plural(data.items.length, 'notification')} shown (latest 60).</p>
    </div>
  )
}
