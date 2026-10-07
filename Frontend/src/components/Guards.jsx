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

// Requires an admin; other signed-in users get a clear "not allowed" page.
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (user.role !== 'admin')
    return (
      <div className="container page">
        <EmptyState title="Admins only" text="Your account does not have access to this area." to="/" action="Back to the store" />
      </div>
    )
  return children
}
