import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faBell, faBookOpen, faCartShopping, faMagnifyingGlass, faMoon, faSun, faUser } from '@fortawesome/free-solid-svg-icons'
import { api, DEMO } from '../api'
import { useAuth, useCart, useTheme, useToast } from '../hooks'
import Cover from '../ui/Cover'
import { isStaff } from '../shared/rules.mjs'

const Logo = () => <FontAwesomeIcon icon={faBookOpen} />

async function resetPreview() {
  if (import.meta.env.VITE_DEMO !== 'true') return
  const { resetDemoData } = await import('../demo/server.js')
  await resetDemoData()
  try {
    ;['bookstore_token', 'bookstore_cart_v2', 'bookstore_coupon', 'folio_recent'].forEach((k) => localStorage.removeItem(k))
    Object.keys(localStorage).filter((k) => k.startsWith('folio_reader_')).forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }
  window.location.reload()
}

function PreviewBanner() {
  if (!DEMO) return null
  return (
    <div className="demo-banner" role="note">
      <strong>Live preview:</strong> everything runs in your browser, nothing is sent anywhere and no payment is real.
      <button type="button" onClick={resetPreview}>Reset sample data</button>
    </div>
  )
}

// Search box with autocomplete: books, authors and series, typo tolerant (the server does the fuzzy matching).
function SearchBox({ onDone }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [q, setQ] = useState(params.get('search') || '')
  const [res, setRes] = useState(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      api(`/api/books/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => !cancelled && (setRes({ term, ...r }), setActive(-1)))
        .catch(() => {})
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const options = []
  const current = q.trim().length >= 2 && res && res.term === q.trim() ? res : null
  if (current) {
    if (current.didYouMean) options.push({ type: 'dym', label: `Did you mean "${current.didYouMean}"?`, to: `/books?search=${encodeURIComponent(current.didYouMean)}` })
    current.books.forEach((b) => options.push({ type: 'book', book: b, to: `/books/${b._id}` }))
    current.authors.forEach((a) => options.push({ type: 'author', label: a, to: `/authors/${encodeURIComponent(a)}` }))
    current.series.forEach((s) => options.push({ type: 'series', label: s.name, to: `/series/${s.slug}` }))
  }
  const go = (to) => {
    setOpen(false)
    onDone?.()
    navigate(to)
  }
  const submit = (e) => {
    e.preventDefault()
    if (active >= 0 && options[active]) return go(options[active].to)
    go(q.trim() ? `/books?search=${encodeURIComponent(q.trim())}` : '/books')
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1))
    } else if (e.key === 'Escape') setOpen(false)
  }
  const show = open && options.length > 0
  return (
    <form className="search" role="search" onSubmit={submit} ref={box}>
      <FontAwesomeIcon icon={faMagnifyingGlass} />
      <label className="sr-only" htmlFor="site-search">Search books, authors or ISBN</label>
      <input
        id="site-search"
        className="input"
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls="search-list"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `opt-${active}` : undefined}
        autoComplete="off"
        placeholder="Search titles, authors or ISBN"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {show && (
        <ul id="search-list" className="suggest" role="listbox" aria-label="Suggestions">
          {options.map((o, i) => (
            <li key={`${o.type}-${i}`} id={`opt-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), go(o.to))}>
              {o.type === 'book' ? (
                <>
                  <span className="sg-cover"><Cover book={o.book} /></span>
                  <span><strong>{o.book.title}</strong><small>{o.book.author}</small></span>
                </>
              ) : (
                <span className="sg-text"><small>{o.type === 'dym' ? '' : o.type === 'author' ? 'Author' : 'Series'}</small> {o.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

// Unread notification count, refreshed every minute while signed in.
function useUnread(user) {
  const [n, setN] = useState(0)
  const load = useCallback(() => {
    api('/api/me/notifications').then((r) => setN(r.unread), () => {})
  }, [])
  useEffect(() => {
    if (!user) return
    const first = setTimeout(load, 0)
    const t = setInterval(load, 60000)
    window.addEventListener('folio:notifications', load)
    return () => {
      clearTimeout(first)
      clearInterval(t)
      window.removeEventListener('folio:notifications', load)
    }
  }, [user, load])
  return user ? n : 0
}

function Header() {
  const { user, logout } = useAuth()
  const { itemsInCart } = useCart()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const loc = useLocation()
  const unread = useUnread(user)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false)
    }
    const esc = (e) => e.key === 'Escape' && (setMenu(false), setOpen(false))
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])
  const out = async () => {
    setMenu(false)
    await logout()
    toast.info('You have been logged out.')
    navigate('/')
  }
  return (
    <header className="header">
      <div className="container header-in">
        <button type="button" className="icon-btn menu-toggle" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <FontAwesomeIcon icon={faBars} />
        </button>
        <Link to="/" className="brand"><Logo /> Folio Books</Link>
        <nav className={`nav ${open ? 'open' : ''}`} aria-label="Main" onClick={() => setOpen(false)}>
          <NavLink to="/books" end={loc.pathname !== '/books'}>Books</NavLink>
          <NavLink to="/genres">Genres</NavLink>
          <NavLink to="/collections">Collections</NavLink>
          <NavLink to="/clubs">Clubs</NavLink>
          <NavLink to="/events">Events</NavLink>
          {user && <NavLink to="/library">Library</NavLink>}
          {isStaff(user) && <NavLink to="/manage">{user.role === 'admin' ? 'Admin' : 'Staff'}</NavLink>}
        </nav>
        <SearchBox onDone={() => setOpen(false)} />
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
          </button>
          {user && (
            <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <FontAwesomeIcon icon={faBell} />
              {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          <Link to="/cart" className="icon-btn" aria-label={`Cart, ${itemsInCart} item${itemsInCart === 1 ? '' : 's'}`}>
            <FontAwesomeIcon icon={faCartShopping} />
            {itemsInCart > 0 && <span className="badge">{itemsInCart}</span>}
          </Link>
          {user ? (
            <div className="user-menu" ref={menuRef}>
              <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label={`Account menu for ${user.name}`} onClick={() => setMenu((m) => !m)}>
                <FontAwesomeIcon icon={faUser} />
              </button>
              {menu && (
                <div className="menu" role="menu" onClick={() => setMenu(false)}>
                  <span className="small muted" style={{ padding: '6px 12px' }}>{user.name} <span className="pill">{user.role === 'user' ? 'Customer' : user.role}</span></span>
                  <Link to="/reading" role="menuitem">Reading life</Link>
                  <Link to="/library" role="menuitem">My library</Link>
                  <Link to="/reading-list" role="menuitem">Reading list</Link>
                  <Link to="/orders" role="menuitem">Orders</Link>
                  <Link to="/returns" role="menuitem">Returns</Link>
                  <Link to="/account" role="menuitem">Rewards and gift cards</Link>
                  {isStaff(user) && <Link to="/manage" role="menuitem">{user.role === 'admin' ? 'Admin area' : 'Staff area'}</Link>}
                  <button type="button" role="menuitem" onClick={out}>Log out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn-sm">Log in</Link>
          )}
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Link to="/" className="brand"><Logo /> Folio Books</Link>
          <p className="muted" style={{ marginTop: 8, maxWidth: '40ch' }}>
            A bookshop for readers: sample an e-book in the browser, keep a reading goal, join a club and find your next favourite.
          </p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><Link to="/books">All books</Link></li>
            <li><Link to="/books?sort=bestselling">Bestsellers</Link></li>
            <li><Link to="/books?preorder=1">Pre-orders</Link></li>
            <li><Link to="/collections">Collections and box sets</Link></li>
            <li><Link to="/gift-cards">Gift cards</Link></li>
          </ul>
        </div>
        <div>
          <h4>Readers</h4>
          <ul>
            <li><Link to="/reading">Reading life</Link></li>
            <li><Link to="/clubs">Book clubs</Link></li>
            <li><Link to="/authors">Authors</Link></li>
            <li><Link to="/events">Events</Link></li>
            <li><Link to="/orders">Orders and returns</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

// Scrollable tables must be reachable by keyboard: give every table wrapper that actually scrolls a tab stop and a label.
function useScrollableRegions() {
  useEffect(() => {
    let t = 0
    const mark = () => {
      document.querySelectorAll('.table-wrap').forEach((el) => {
        const scrolls = el.scrollWidth > el.clientWidth + 1
        if (scrolls) {
          el.setAttribute('tabindex', '0')
          el.setAttribute('role', 'region')
          el.setAttribute('aria-label', el.querySelector('caption')?.textContent || 'Table')
        } else el.removeAttribute('tabindex')
      })
    }
    const obs = new MutationObserver(() => (clearTimeout(t), (t = setTimeout(mark, 150))))
    obs.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', mark)
    mark()
    return () => (obs.disconnect(), window.removeEventListener('resize', mark), clearTimeout(t))
  }, [])
}

export default function Layout() {
  const { pathname } = useLocation()
  useScrollableRegions()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <PreviewBanner />
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
