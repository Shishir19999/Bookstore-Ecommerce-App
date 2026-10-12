import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { toItems } from './cart'
import { computeTotals, tierFor } from '../shared/rules.mjs'

// Price quote for the cart. Signed-in shoppers get the server's authoritative quote (coupons, points, gift cards,
// box sets); visitors get a local estimate computed with the very same shared rules.
export function useQuote(cart, user, settings, opts = {}) {
  const [state, setState] = useState({ key: '', quote: null, error: '' })
  const { couponCode = '', country = '', method = 'standard', giftWrap = false, giftMessage = '', giftCardCode = '', points = 0, enabled = true } = opts
  const key = JSON.stringify([cart.map((l) => [l.key, l.qty]), user?.id || '', couponCode, country, method, giftWrap, giftMessage, giftCardCode, points])
  const active = enabled && cart.length > 0

  const estimate = useMemo(() => {
    if (user || !active) return null
    const lines = cart.map((l) => (l.giftCard ? { kind: 'giftcard', price: l.price, qty: 1 } : { kind: 'book', book: l._id, format: l.format, price: l.price, qty: l.qty }))
    const tier = tierFor(0, settings)
    return { totals: computeTotals(lines, {}, { country: country || undefined, method, giftWrap, tier }, settings), tier, estimate: true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, settings])

  useEffect(() => {
    if (!user || !active) return
    let cancelled = false
    const t = setTimeout(() => {
      api('/api/checkout/quote', { method: 'POST', body: { items: toItems(cart), couponCode: couponCode || undefined, shipping: { country: country || undefined }, method, giftWrap, giftMessage, giftCardCode: giftCardCode || undefined, points } }).then(
        (quote) => !cancelled && setState({ key, quote, error: '' }),
        (err) => !cancelled && setState({ key, quote: null, error: err.message })
      )
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active])

  if (!user) return { quote: estimate, error: '', loading: false }
  const fresh = state.key === key
  return { quote: state.quote, error: fresh ? state.error : '', loading: active && !fresh }
}
