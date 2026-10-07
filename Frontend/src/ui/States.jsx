import { Link } from 'react-router-dom'

export const Skeleton = ({ w, h = 16, r, className = '' }) => (
  <span className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />
)

export const BookCardSkeleton = () => (
  <li className="card book-card" aria-hidden="true">
    <div className="skeleton skeleton-cover" />
    <div className="book-card-body">
      <Skeleton w="85%" h={18} />
      <Skeleton w="55%" />
      <Skeleton w="40%" />
      <Skeleton w="100%" h={38} r={10} />
    </div>
  </li>
)

export const GridSkeleton = ({ count = 8 }) => (
  <ul className="book-grid" role="status" aria-label="Loading books">
    {Array.from({ length: count }, (_, i) => (
      <BookCardSkeleton key={i} />
    ))}
  </ul>
)

export const PageSkeleton = () => (
  <div className="container section" role="status" aria-label="Loading">
    <Skeleton w="40%" h={32} />
    <div style={{ height: 16 }} />
    <Skeleton w="100%" h={14} />
    <div style={{ height: 8 }} />
    <Skeleton w="90%" h={14} />
    <div style={{ height: 8 }} />
    <Skeleton w="70%" h={14} />
  </div>
)

export const EmptyState = ({ title, text, to, action, children }) => (
  <div className="state empty">
    <svg className="state-art" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="14" width="14" height="40" rx="2" />
      <rect x="26" y="8" width="14" height="46" rx="2" />
      <rect x="42" y="18" width="12" height="36" rx="2" transform="rotate(8 48 36)" />
    </svg>
    <h2>{title}</h2>
    {text && <p>{text}</p>}
    {to && action && (
      <Link className="btn btn-primary" to={to}>
        {action}
      </Link>
    )}
    {children}
  </div>
)

export const ErrorState = ({ message, onRetry, title = 'Something went wrong' }) => (
  <div className="state error-state" role="alert">
    <svg className="state-art" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" strokeWidth="4" />
      <path d="M32 18v18M32 44v2" strokeWidth="5" strokeLinecap="round" />
    </svg>
    <h2>{title}</h2>
    <p>{message}</p>
    {onRetry && (
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
)
