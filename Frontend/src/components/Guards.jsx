import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks'
import { PageSkeleton, EmptyState } from '../ui/States'

// Requires a signed-in user; remembers where to come back to after logging in.
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return children
}

// Requires staff or admin (back office). With `admin`, only admins get in; other signed-in users get a clear "not allowed" page.
export function StaffRoute({ children, admin = false }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  const ok = admin ? user.role === 'admin' : user.role === 'staff' || user.role === 'admin'
  if (!ok)
    return (
      <div className="container page">
        <EmptyState title={admin ? 'Admins only' : 'Staff only'} text="Your account does not have access to this area." to="/" action="Back to the store" />
      </div>
    )
  return children
}
