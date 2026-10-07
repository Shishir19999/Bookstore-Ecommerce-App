const FLOW = ['placed', 'processing', 'shipped', 'delivered']
export default function Tracking({ status }) {
  if (status === 'cancelled')
    return (
      <ol className="track cancelled" aria-label="Order cancelled"><li className="done">Placed</li><li className="done">Cancelled</li></ol>
    )
  const at = FLOW.indexOf(status)
  return (
    <ol className="track" aria-label={`Order status: ${status}`}>
      {FLOW.map((s, i) => (
        <li key={s} className={i <= at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>{s}</li>
      ))}
    </ol>
  )
}

