import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useFetch, useTitle } from '../hooks'
import { ErrorState, PageSkeleton } from '../ui/States'
import { StatusPill } from '../ui/Parts'
import ManageNav from './ManageNav'
import { ORDER_STATUSES, STATUS_LABEL, fmtDate, money, shortId } from '../lib/format'

const shortDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Accessible SVG bar chart of revenue per day (each bar has a title tooltip; the data is also summarised in the label).
function SalesChart({ days }) {
  const W = 640
  const H = 220
  const pad = { l: 44, r: 8, t: 10, b: 26 }
  const max = Math.max(1, ...days.map((d) => d.revenue))
  const nice = Math.ceil(max / 50) * 50 || 50
  const bw = (W - pad.l - pad.r) / days.length
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice)
  const step = Math.ceil(days.length / 6)
  const total = days.reduce((s, d) => s + d.revenue, 0)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Revenue per day over the last ${days.length} days, ${money(total)} in total`}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(nice * t)} y2={y(nice * t)} />
          <text x={pad.l - 6} y={y(nice * t) + 4} textAnchor="end">{Math.round(nice * t)}</text>
        </g>
      ))}
      {days.map((d, i) => (
        <g key={d.date}>
          <rect className="bar-rect" x={pad.l + i * bw + bw * 0.12} width={Math.max(1, bw * 0.76)} y={y(d.revenue)} height={Math.max(0, H - pad.b - y(d.revenue))} rx="2">
            <title>{`${shortDate(d.date)}: ${money(d.revenue)} from ${d.orders} order${d.orders === 1 ? '' : 's'}`}</title>
          </rect>
          {i % step === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle">{shortDate(d.date)}</text>}
        </g>
      ))}
    </svg>
  )
}

function AdminStats() {
  const [days, setDays] = useState(30)
  const { data, error, reload } = useFetch(`/api/admin/stats?days=${days}`)
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  const { totals, salesByDay, topBooks, statusCounts } = data
  const periodRevenue = salesByDay.reduce((s, d) => s + d.revenue, 0)
  return (
    <>
      <div className="kpis">
        {[['Revenue (all time)', money(totals.revenue)], ['Orders', totals.orders], ['Titles in catalogue', totals.books], ['Accounts', totals.users]].map(([l, v]) => (
          <div className="card kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>
        ))}
      </div>
      <section className="card" aria-labelledby="sales-h" style={{ marginBottom: 18 }}>
        <div className="row between">
          <div>
            <h2 id="sales-h" style={{ fontSize: '1.3rem', marginBottom: 0 }}>Sales</h2>
            <span className="muted small">{money(periodRevenue)} in the last {days} days (gift card sales excluded)</span>
          </div>
          <div className="seg" role="group" aria-label="Time range">
            {[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>)}
          </div>
        </div>
        <SalesChart days={salesByDay} />
      </section>
      <div className="admin-two">
        <section className="card" aria-labelledby="top-h">
          <h2 id="top-h" style={{ fontSize: '1.2rem' }}>Top sellers</h2>
          {topBooks.length === 0 ? <p className="muted">No sales yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Book</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
                <tbody>{topBooks.map((b) => <tr key={b.id}><td><Link to={`/books/${b.id}`}>{b.title}</Link></td><td className="num">{b.units}</td><td className="num">{money(b.revenue)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card" aria-labelledby="st-h">
          <h2 id="st-h" style={{ fontSize: '1.2rem' }}>Orders by status</h2>
          <div className="row">{ORDER_STATUSES.map((s) => <span key={s} className="pill">{STATUS_LABEL[s]}: {statusCounts[s] || 0}</span>)}</div>
          <p className="small muted" style={{ marginTop: 14 }}>More detail, formats and countries in <Link to="/manage/reports">Reports</Link>.</p>
        </section>
      </div>
    </>
  )
}

export default function Overview() {
  const { user } = useAuth()
  useTitle(user.role === 'admin' ? 'Admin overview' : 'Staff overview')
  const { data, error, reload } = useFetch('/api/staff/overview')
  return (
    <div className="container page">
      <h1>{user.role === 'admin' ? 'Admin overview' : 'Staff overview'}</h1>
      <ManageNav />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <PageSkeleton /> : (
        <>
          <ul className="task-grid" aria-label="Things to do">
            {[
              ['To ship', data.counts.toShip, '/manage/orders?status=placed', 'orders waiting to be shipped'],
              ['Pre-orders', data.counts.preorders, '/manage/orders?status=preorder', 'waiting for release'],
              ['Returns', data.counts.returnsOpen, '/manage/returns', 'open requests'],
              ['Reported reviews', data.counts.reviewsReported, '/manage/moderation', 'to moderate'],
              ['Questions', data.counts.questionsOpen, '/manage/moderation?tab=questions', 'without an answer'],
              ['Low stock', data.counts.lowStock, '/manage/books?filter=low', 'titles to reorder'],
            ].map(([label, n, to, hint]) => (
              <li key={label}>
                <Link to={to} className={`card task ${n > 0 ? 'hot' : ''}`}>
                  <span className="v">{n}</span><span><strong>{label}</strong><br /><span className="small muted">{hint}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="admin-two" style={{ marginBottom: 20 }}>
            <section className="card" aria-labelledby="low-h">
              <h2 id="low-h" style={{ fontSize: '1.2rem' }}>Low stock</h2>
              {data.lowStock.length === 0 ? <p className="muted">All titles are well stocked.</p> : (
                <ul className="plain">
                  {data.lowStock.map((b) => (
                    <li key={b._id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div><Link to={`/manage/books/${b._id}/edit`}>{b.title}</Link><div className="small muted">{b.author}</div></div>
                      <span className={`pill ${b.stock === 0 ? 'pill-danger' : 'pill-warn'}`}>{b.stock === 0 ? 'Out of stock' : `${b.stock} left`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="rec-h">
              <h2 id="rec-h" style={{ fontSize: '1.2rem' }}>Recent orders</h2>
              <ul className="plain">
                {data.recentOrders.map((o) => (
                  <li key={o._id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div><Link to={`/orders/${o._id}/invoice`}>#{shortId(o._id)}</Link> <span className="small muted">{o.customer} &middot; {fmtDate(o.createdAt)}</span></div>
                    <span className="row" style={{ gap: 8 }}><StatusPill status={o.status} /><strong>{money(o.total)}</strong></span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      {user.role === 'admin' && <AdminStats />}
    </div>
  )
}
