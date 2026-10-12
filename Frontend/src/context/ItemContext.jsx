import { useCallback, useEffect, useMemo, useState } from 'react'
import { ItemCtx } from './itemContextObject'
import { defaultFormat, findFormat, isDigital } from '../shared/rules.mjs'

const CART_KEY = 'bookstore_cart_v2'
const MAX_QTY = 20 // matches the server limit

const keyOf = (id, format, bundle) => `${id}|${format}|${bundle || ''}`
const loadCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY))
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.key) : []
  } catch {
    return []
  }
}

// Cart lines: { key, _id, title, author, genre, price, image, format, qty, bundle? } or { key, giftCard, title, price, qty: 1 }.
// Prices here are for display only; the server recomputes everything from the database.
const toLine = (book, qty, format, bundle) => {
  const f = findFormat(book, format) || defaultFormat(book)
  const { _id, title, author, genre, image } = book
  return { key: keyOf(_id, f.type, bundle), _id, title, author, genre, image, price: f.price, format: f.type, qty: isDigital(f.type) ? 1 : Math.min(qty, MAX_QTY), ...(bundle ? { bundle } : {}) }
}

function CustomItemContext({ children }) {
  const [cart, setCart] = useState(loadCart)
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      /* storage unavailable */
    }
  }, [cart])

  const addLinesRaw = useCallback((lines) => {
    setCart((prev) => {
      const next = [...prev]
      for (const l of lines) {
        const i = next.findIndex((x) => x.key === l.key)
        if (i >= 0) next[i] = { ...next[i], price: l.price, qty: isDigital(l.format) ? 1 : Math.min(next[i].qty + l.qty, MAX_QTY) }
        else next.push(l)
      }
      return next
    })
  }, [])

  const addToCart = useCallback((book, qty = 1, format) => addLinesRaw([toLine(book, qty, format || defaultFormat(book).type)]), [addLinesRaw])
  // Adds a box set: every book is tagged with the set so the discount applies at checkout.
  const addBundle = useCallback((bundle) => addLinesRaw(bundle.books.map((b) => toLine(b, 1, 'paperback', bundle._id))), [addLinesRaw])
  const addGiftCard = useCallback(
    (giftCard) => addLinesRaw([{ key: `gc|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`, giftCard, title: 'Gift card', price: giftCard.amount, qty: 1, format: 'giftcard' }]),
    [addLinesRaw]
  )
  // Adds several lines at once (used by "reorder")
  const addLines = useCallback((items) => addLinesRaw(items.map((b) => toLine(b, b.qty, b.format || 'paperback'))), [addLinesRaw])

  // Removes one unit; the line disappears at zero
  const removeFromCart = useCallback((line) => setCart((prev) => prev.flatMap((l) => (l.key !== line.key ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []))), [])
  const removeLine = useCallback((line) => setCart((prev) => prev.filter((l) => l.key !== line.key)), [])
  const clearCart = useCallback(() => setCart([]), [])

  const { itemsInCart, totalPrice } = useMemo(
    () => ({ itemsInCart: cart.reduce((n, l) => n + l.qty, 0), totalPrice: Math.round(cart.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100 }),
    [cart]
  )
  const value = useMemo(
    () => ({ cart, addToCart, addBundle, addGiftCard, addLines, removeFromCart, removeLine, clearCart, itemsInCart, totalPrice }),
    [cart, addToCart, addBundle, addGiftCard, addLines, removeFromCart, removeLine, clearCart, itemsInCart, totalPrice]
  )
  return <ItemCtx.Provider value={value}>{children}</ItemCtx.Provider>
}
export default CustomItemContext
