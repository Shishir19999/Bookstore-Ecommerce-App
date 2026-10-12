import { useState } from 'react'
import { downloadCsv } from '../api'
import { useFetch, useTitle, useToast } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import { BarList } from '../ui/Parts'
import ManageNav from './ManageNav'
import { FORMAT_LABEL, money } from '../lib/format'
import { addDays, dayKey } from '../shared/rules.mjs'

function Trend({ days }) {
  const W = 640
  const H = 160
  const max = Math.max(1, ...days.map((d) => d.revenue))
  const bw = W / days.length
  const total = days.reduce((s, d) => s + d.revenue, 0)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Revenue per day from ${days[0]?.date} to ${days.at(-1)?.date}, ${money(total)} in total`}>
      {days.map((d, i) => <rect key={d.date} className="bar-rect" x={i * bw + 0.5} width={Math.max(1, bw - 1)} y={H - 20 - (d.revenue / max) * (H - 30)} height={(d.revenue / max) * (H - 30)}><title>{`${d.date}: ${money(d.revenue)} (${d.orders} orders)`}</title></rect>)}
      <text x="0" y={H - 4}>{days[0]?.date}</text>
      <text x={W} y={H - 4} textAnchor="end">{days.at(-1)?.date}</text>
    </svg>
  )
}

export default function Reports() {
  useTitle('Reports')
  const toast = useToast()
  const today = dayKey(new Date())
  const [range, setRange] = useState({ from: addDays(today, -89), to: today })
  const [applied, setApplied] = useState(range)
  const { data, error, reload } = useFetch(`/api/admin/reports?from=${applied.from}&to=${applied.to}`)
  const exp = (path, name) => downloadCsv(`${path}?from=${applied.from}&to=${applied.to}`, name).catch((e) => toast.error(e.message))
  const k = data?.kpis
  return (
    <div className="container page">
      <h1>Reports</h1>
      <ManageNav />
      <form className="row" onSubmit={(e) => (e.preventDefault(), setApplied(range))} style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}><label htmlFor="r-from">From</label><input id="r-from" className="input" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="r-to">To</label><input id="r-to" className="input" type="date" value={range.to} max={today} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <button className="btn btn-primary">Apply</button>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn btn-sm" onClick={() => exp('/api/export/orders.csv', 'orders.csv')}>Orders CSV</button>
          <button type="button" className="btn btn-sm" onClick={() => exp('/api/export/sales.csv', 'sales.csv')}>Sales lines CSV</button>
        </div>
      </form>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : (
        <>
          <div className="kpis">
            {[['Revenue', money(k.revenue)], ['Orders', k.orders], ['Average order', money(k.avgOrderValue)], ['Units sold', k.units], ['New customers', k.newCustomers], ['Returns', `${k.returns} (${k.returnRate}%)`], ['Refunded', money(k.refunded)], ['Gift card sales', money(k.giftCardSales)], ['Points issued', k.pointsIssued], ['Points liability', money(k.loyaltyLiability)]].map(([l, v]) => <div className="card kpi" key={l}><div className="v" style={{ fontSize: '1.5rem' }}>{v}</div><div className="l">{l}</div></div>)}
          </div>
          <section className="card" aria-labelledby="rt-h" style={{ marginBottom: 18 }}><h2 id="rt-h" style={{ fontSize: '1.2rem' }}>Revenue per day</h2><Trend days={data.byDay} /></section>
          <div className="admin-two">
            <section className="card" aria-labelledby="fm-h"><h2 id="fm-h" style={{ fontSize: '1.2rem' }}>By edition</h2><BarList rows={data.byFormat.map((r) => ({ ...r, name: FORMAT_LABEL[r.name] || r.name }))} format={money} /></section>
            <section className="card" aria-labelledby="gn-h"><h2 id="gn-h" style={{ fontSize: '1.2rem' }}>By genre</h2><BarList rows={data.byGenre} format={money} /></section>
            <section className="card" aria-labelledby="au-h"><h2 id="au-h" style={{ fontSize: '1.2rem' }}>Top authors</h2><BarList rows={data.topAuthors} format={money} /></section>
            <section className="card" aria-labelledby="co-h"><h2 id="co-h" style={{ fontSize: '1.2rem' }}>By country</h2><BarList rows={data.byCountry} format={money} />
              {data.coupons.length > 0 && <><h3 style={{ marginTop: 16 }}>Coupons used</h3><ul className="plain small">{data.coupons.map((c) => <li key={c.name}><strong>{c.name}</strong>: {c.uses} use{c.uses === 1 ? '' : 's'}, {money(c.discount)} off</li>)}</ul></>}
            </section>
          </div>
          <section className="card" style={{ marginTop: 18 }} aria-labelledby="tb-h">
            <h2 id="tb-h" style={{ fontSize: '1.2rem' }}>Best sellers in this period</h2>
            <div className="table-wrap"><table className="table"><caption className="sr-only">Best sellers</caption><thead><tr><th>Title</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead><tbody>{data.topBooks.map((b) => <tr key={b.id}><td>{b.title}</td><td className="num">{b.units}</td><td className="num">{money(b.revenue)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  )
}
