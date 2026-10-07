const KEY = 'bookstore_coupon'

export const savedCoupon = () => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export const saveCoupon = (code) => {
  try {
    if (code) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}
