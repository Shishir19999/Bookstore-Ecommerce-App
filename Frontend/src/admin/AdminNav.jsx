import { NavLink } from 'react-router-dom'

export default function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {[
        ['/admin/dashboard', 'Dashboard'],
        ['/admin/books', 'Books'],
        ['/admin/orders', 'Orders'],
        ['/admin/coupons', 'Coupons'],
      ].map(([to, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => `chip ${isActive ? 'on' : ''}`}>{label}</NavLink>
      ))}
    </nav>
  )
}
