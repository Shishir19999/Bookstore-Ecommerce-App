import { EmptyState } from '../ui/States'
import { useTitle } from '../hooks'

export default function NotFound() {
  useTitle('Page not found')
  return (
    <div className="container page">
      <EmptyState title="404: this page is not on our shelves" text="The link may be broken or the page may have moved." to="/" action="Back to the store" />
    </div>
  )
}
