import { useContext, useEffect, useState } from 'react'
import { api } from './api'
import { savedCoupon, saveCoupon } from './lib/coupon'
import { AuthCtx } from './context/authContextObject'
import { ItemCtx } from './context/itemContextObject'
import { ThemeCtx, ToastCtx, ConfirmCtx, ReadingCtx } from './context/contexts'

export const useAuth = () => useContext(AuthCtx)
export const useCart = () => useContext(ItemCtx)
export const useTheme = () => useContext(ThemeCtx)
export const useToast = () => useContext(ToastCtx)
export const useConfirm = () => useContext(ConfirmCtx)
export const useReading = () => useContext(ReadingCtx)

export const SITE = 'Folio Books'

// Sets the document title for the current page.
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE} - books for every reader`
  }, [title])
}

// GET helper: keeps the previous data while a new request is in flight; `reload` refetches.
export function useFetch(path, { enabled = true } = {}) {
  const [tick, setTick] = useState(0)
  const [res, setRes] = useState({ key: null, data: null, error: '' })
  const key = enabled && path ? `${path}#${tick}` : null

  useEffect(() => {
    if (!key) return
    let cancelled = false
    api(path).then(
      (data) => !cancelled && setRes({ key, data, error: '' }),
      (err) => !cancelled && setRes({ key, data: null, error: err.message })
    )
    return () => {
      cancelled = true
    }
  }, [key, path])

  const settled = res.key === key
  return {
    data: res.data,
    error: settled ? res.error : '',
    loading: !!key && !settled,
    reload: () => setTick((t) => t + 1),
  }
}

// Re-validates the saved coupon code against the current cart; returns { code, discount, info, error, apply, remove }.
export function useCoupon(cart, enabled) {
  const [code, setCode] = useState(savedCoupon)
  const [state, setState] = useState({ discount: 0, info: null, error: '' })
  const sig = JSON.stringify(cart.map((l) => [l._id, l.qty]))

  useEffect(() => {
    if (!code || !enabled || cart.length === 0) return
    let cancelled = false
    api('/api/coupons/validate', { method: 'POST', body: { code, items: cart.map((l) => ({ book: l._id, qty: l.qty })) } }).then(
      (r) => !cancelled && setState({ discount: r.discount, info: r.coupon, error: '' }),
      (err) => !cancelled && setState({ discount: 0, info: null, error: err.message })
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, enabled, sig])

  const apply = (value) => {
    const c = value.trim().toUpperCase()
    saveCoupon(c)
    setState({ discount: 0, info: null, error: '' })
    setCode(c)
  }
  const remove = () => {
    saveCoupon('')
    setState({ discount: 0, info: null, error: '' })
    setCode('')
  }
  const active = code && enabled && cart.length > 0
  return { code: active ? code : '', discount: active ? state.discount : 0, info: active ? state.info : null, error: active ? state.error : '', apply, remove }
}
