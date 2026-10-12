import { useState } from 'react'
import { api } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import { Field } from '../ui/Parts'
import ManageNav from './ManageNav'

const pct = (n) => String(Math.round(n * 10000) / 100)

// Store rules shared with checkout: shipping, tax by country, gift wrap, returns, loyalty and gift cards.
const init = (data) => ({
  storeName: data.storeName,
  shipping: Object.fromEntries(Object.entries(data.shipping).map(([k, v]) => [k, String(v)])),
  giftWrap: String(data.giftWrap),
  returns: { windowDays: String(data.returns.windowDays) },
  loyalty: Object.fromEntries(Object.entries(data.loyalty).map(([k, v]) => [k, String(v)])),
  giftCards: { min: String(data.giftCards.min), max: String(data.giftCards.max) },
  tax: Object.fromEntries(Object.entries(data.tax).map(([c, r]) => [c, { physical: pct(r.physical), digital: pct(r.digital) }])),
})

export default function Settings() {
  useTitle('Store settings')
  const { data, error, reload } = useFetch('/api/admin/settings')
  if (error) return <div className="container page"><ManageNav /><ErrorState message={error} onRetry={reload} /></div>
  if (!data) return <PageSkeleton />
  return <SettingsForm key={JSON.stringify(data)} data={data} reload={reload} />
}

function SettingsForm({ data, reload }) {
  const toast = useToast()
  const [f, setF] = useState(() => init(data))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [newCountry, setNewCountry] = useState({ code: '', physical: '0', digital: '0' })
  const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && k !== 'homeCountry' ? Number(v) : v]))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setFailure('')
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          storeName: f.storeName,
          shipping: num(f.shipping),
          giftWrap: Number(f.giftWrap),
          returns: num(f.returns),
          loyalty: num(f.loyalty),
          giftCards: { ...data.giftCards, ...num(f.giftCards) },
          tax: Object.fromEntries(Object.entries(f.tax).map(([c, r]) => [c, { physical: Number(r.physical) / 100, digital: Number(r.digital) / 100 }])),
        },
      })
      toast.success('Settings saved. Checkout uses them immediately.')
      reload()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }
  const set = (group, key) => (e) => setF({ ...f, [group]: { ...f[group], [key]: e.target.value } })
  const setTax = (c, k) => (e) => setF({ ...f, tax: { ...f.tax, [c]: { ...f.tax[c], [k]: e.target.value } } })
  const addCountry = () => {
    const code = newCountry.code.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) return toast.error('Use a two-letter country code, for example NZ.')
    setF({ ...f, tax: { ...f.tax, [code]: { physical: newCountry.physical, digital: newCountry.digital } } })
    setNewCountry({ code: '', physical: '0', digital: '0' })
  }
  return (
    <div className="container page">
      <h1>Store settings</h1>
      <ManageNav />
      <form onSubmit={save} noValidate style={{ maxWidth: 900 }}>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Store</h2>
          <Field label="Store name" value={f.storeName} onChange={(e) => setF({ ...f, storeName: e.target.value })} maxLength={60} />
        </section>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Shipping and gift wrapping (USD)</h2>
          <div className="grid2">
            <Field label="Standard shipping" type="number" step="0.01" min="0" value={f.shipping.standard} onChange={set('shipping', 'standard')} />
            <Field label="Express shipping" type="number" step="0.01" min="0" value={f.shipping.express} onChange={set('shipping', 'express')} />
            <Field label="International surcharge" type="number" step="0.01" min="0" value={f.shipping.international} onChange={set('shipping', 'international')} hint="Added outside the home country." />
            <Field label="Free standard shipping over" type="number" step="0.01" min="0" value={f.shipping.freeOver} onChange={set('shipping', 'freeOver')} />
            <Field label="Home country (two letters)" value={f.shipping.homeCountry} onChange={set('shipping', 'homeCountry')} maxLength={2} />
            <Field label="Gift wrapping fee" type="number" step="0.01" min="0" value={f.giftWrap} onChange={(e) => setF({ ...f, giftWrap: e.target.value })} />
          </div>
        </section>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Tax by country</h2>
          <p className="small muted">Percent added to goods (not shipping). Printed books and digital goods can be taxed differently.</p>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Tax rates by country</caption>
              <thead><tr><th scope="col">Country</th><th scope="col">Printed books %</th><th scope="col">Digital %</th></tr></thead>
              <tbody>
                {Object.entries(f.tax).map(([c, r]) => (
                  <tr key={c}>
                    <th scope="row">{c}</th>
                    <td><label className="sr-only" htmlFor={`tp-${c}`}>{c} printed tax percent</label><input id={`tp-${c}`} className="input" type="number" step="0.01" min="0" max="100" value={r.physical} onChange={setTax(c, 'physical')} style={{ maxWidth: 120 }} /></td>
                    <td><label className="sr-only" htmlFor={`td-${c}`}>{c} digital tax percent</label><input id={`td-${c}`} className="input" type="number" step="0.01" min="0" max="100" value={r.digital} onChange={setTax(c, 'digital')} style={{ maxWidth: 120 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
            <Field label="Add a country" value={newCountry.code} onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })} maxLength={2} placeholder="NZ" style={{ maxWidth: 110 }} />
            <Field label="Printed %" type="number" step="0.01" value={newCountry.physical} onChange={(e) => setNewCountry({ ...newCountry, physical: e.target.value })} style={{ maxWidth: 110 }} />
            <Field label="Digital %" type="number" step="0.01" value={newCountry.digital} onChange={(e) => setNewCountry({ ...newCountry, digital: e.target.value })} style={{ maxWidth: 110 }} />
            <button type="button" className="btn" style={{ marginBottom: 14 }} onClick={addCountry}>Add</button>
          </div>
        </section>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Returns and gift cards</h2>
          <div className="grid2">
            <Field label="Return window (days after delivery)" type="number" min="0" max="365" value={f.returns.windowDays} onChange={set('returns', 'windowDays')} />
            <Field label="Gift card minimum (USD)" type="number" min="1" value={f.giftCards.min} onChange={set('giftCards', 'min')} />
            <Field label="Gift card maximum (USD)" type="number" min="1" value={f.giftCards.max} onChange={set('giftCards', 'max')} />
          </div>
        </section>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Loyalty rewards</h2>
          <div className="grid2">
            <Field label="Points earned per dollar" type="number" step="0.1" min="0" value={f.loyalty.earnPerDollar} onChange={set('loyalty', 'earnPerDollar')} />
            <Field label="Value of one point (USD)" type="number" step="0.001" min="0.001" max="1" value={f.loyalty.pointValue} onChange={set('loyalty', 'pointValue')} />
            <Field label="Max share of goods payable with points (%)" type="number" min="0" max="100" value={f.loyalty.maxRedeemPct} onChange={set('loyalty', 'maxRedeemPct')} />
            <Field label="Silver from (lifetime points)" type="number" min="0" value={f.loyalty.silverAt} onChange={set('loyalty', 'silverAt')} />
            <Field label="Gold from (lifetime points)" type="number" min="0" value={f.loyalty.goldAt} onChange={set('loyalty', 'goldAt')} hint="Gold members get free standard shipping." />
            <Field label="Silver bonus (0.25 = 25%)" type="number" step="0.05" min="0" max="2" value={f.loyalty.silverBonus} onChange={set('loyalty', 'silverBonus')} />
            <Field label="Gold bonus (0.5 = 50%)" type="number" step="0.05" min="0" max="2" value={f.loyalty.goldBonus} onChange={set('loyalty', 'goldBonus')} />
          </div>
        </section>
        {failure && <p className="alert alert-error" role="alert">{failure}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</button>
      </form>
    </div>
  )
}
