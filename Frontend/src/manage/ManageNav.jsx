import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks'

const SECTIONS = [
  ['/manage', 'Overview', 'staff', true],
  ['/manage/books', 'Books', 'staff'],
  ['/manage/isbn', 'Add by ISBN', 'staff'],
  ['/manage/orders', 'Orders', 'staff'],
  ['/manage/returns', 'Returns', 'staff'],
  ['/manage/moderation', 'Moderation', 'staff'],
  ['/manage/catalog', 'Catalogue extras', 'staff'],
  ['/manage/users', 'Users', 'admin'],
  ['/manage/coupons', 'Coupons', 'admin'],
  ['/manage/giftcards', 'Gift cards', 'admin'],
  ['/manage/reports', 'Reports', 'admin'],
  ['/manage/settings', 'Settings', 'admin'],
]

// Section links for the back office; admin-only sections are hidden from staff.
export default function ManageNav() {
  const { user } = useAuth()
  return (
    <nav className="admin-nav" aria-label="Back office sections">
      {SECTIONS.filter(([, , role]) => role === 'staff' || user?.role === 'admin').map(([to, label, , end]) => (
        <NavLink key={to} to={to} end={!!end} className={({ isActive }) => `chip ${isActive ? 'on' : ''}`}>{label}</NavLink>
      ))}
    </nav>
  )
}
