import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import Cover from '../ui/Cover'
import { Stars } from '../ui/Stars'
import { money, authorPath } from '../lib/format'
import { useCart, useReading, useToast } from '../hooks'

const DAY = 86400000
const NOW = Date.now()

// One book in a grid or strip: cover, title, author, rating, price, add-to-cart and reading-list heart.
export default function BookCard({ book, badge }) {
  const { addToCart } = useCart()
  const { statusOf, setStatus } = useReading()
  const toast = useToast()
  const saved = !!statusOf(book._id)
  const isNew = NOW - new Date(book.publishedAt).getTime() < 45 * DAY
  const tag = badge || (isNew ? 'New' : null)

  return (
    <li className="card book-card">
      {tag && <span className="tag-corner">{tag}</span>}
      <button
        type="button"
        className="icon-btn wish"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${book.title} from your reading list` : `Save ${book.title} to your reading list`}
        onClick={() => setStatus(book, saved ? null : 'want')}
      >
        <FontAwesomeIcon icon={faHeart} style={{ opacity: saved ? 1 : 0.35 }} />
      </button>
      <Link to={`/books/${book._id}`} className="book-card-cover" aria-label={`${book.title}, details`} tabIndex={-1}>
        <Cover book={book} />
      </Link>
      <div className="book-card-body">
        <Link to={`/books/${book._id}`} className="book-title">{book.title}</Link>
        <Link to={authorPath(book.author)} className="book-author">{book.author}</Link>
        <Stars value={book.rating} count={book.numReviews} />
        <div className="book-foot">
          <span className="price">{money(book.price)}</span>
          {book.stock > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                addToCart(book)
                toast.success(`Added "${book.title}" to your cart.`)
              }}
            >
              Add
            </button>
          ) : (
            <span className="pill pill-danger">Sold out</span>
          )}
        </div>
      </div>
    </li>
  )
}
