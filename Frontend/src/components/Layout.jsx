import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faBookOpen, faCartShopping, faMagnifyingGlass, faMoon, faSun, faUser } from '@fortawesome/free-solid-svg-icons'
import { DEMO } from '../api'
import { useAuth, useCart, useTheme, useToast } from '../hooks'

const Logo = () => <FontAwesomeIcon icon={faBookOpen} />

async function resetDemo() {
  if (import.meta.env.VITE_DEMO !== 'true') return
  const { resetDemoData } = await import('../demo/server.js')
  resetDemoData()
  try {
    ;['bookstore_token', 'bookstore_cart'].forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }
  window.location.reload()
}

function DemoBanner() {
  if (!DEMO) return null
  return (
    <div className="demo-banner" role="note">
      <strong>Demo mode:</strong> runs entirely in your browser, nothing is sent anywhere and no payment is real.
      <button type="button" onClick={resetDemo}>Reset demo data</button>
    </div>
  )
}

function Header() {
  const { user, logout } = useAuth()
  const { itemsInCart } = useCart()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState(params.get('search') || '')
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

  const submit = (e) => {
    e.preventDefault()
    setOpen(false)
    navigate(q.trim() ? `/books?search=${encodeURIComponent(q.trim())}` : '/books')
  }

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
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/books" end={loc.pathname !== '/books'}>All books</NavLink>
          <NavLink to="/genres">Genres</NavLink>
          {user && <NavLink to="/reading-list">Reading list</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <form className="search" role="search" onSubmit={submit}>
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <label className="sr-only" htmlFor="site-search">Search books or authors</label>
          <input id="site-search" className="input" type="search" placeholder="Search titles or authors" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
          </button>
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
                  <span className="small muted" style={{ padding: '6px 12px' }}>{user.name}</span>
                  <Link to="/orders" role="menuitem">My orders</Link>
                  <Link to="/reading-list" role="menuitem">Reading list</Link>
                  {user.role === 'admin' && <Link to="/admin" role="menuitem">Admin dashboard</Link>}
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
            An independent bookshop for curious readers: preview a chapter, keep a reading list and find your next favourite.
          </p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><Link to="/books">All books</Link></li>
            <li><Link to="/books?sort=bestselling">Bestsellers</Link></li>
            <li><Link to="/books?sort=newest">New arrivals</Link></li>
            <li><Link to="/genres">Genres</Link></li>
          </ul>
        </div>
        <div>
          <h4>Account</h4>
          <ul>
            <li><Link to="/orders">Orders</Link></li>
            <li><Link to="/reading-list">Reading list</Link></li>
            <li><Link to="/cart">Cart</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <DemoBanner />
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
