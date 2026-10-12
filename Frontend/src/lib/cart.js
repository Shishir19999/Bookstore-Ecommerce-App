// Turns cart lines into the request body the API expects (ids, formats and quantities only: the server prices the cart).
export const toItems = (cart) => cart.map((l) => (l.giftCard ? { giftCard: l.giftCard } : { book: l._id, format: l.format, qty: l.qty, ...(l.bundle ? { bundle: l.bundle } : {}) }))
