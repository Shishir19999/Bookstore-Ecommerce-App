import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { ReadingCtx } from './contexts'
import { useAuth, useToast } from '../hooks'

const LABEL = { want: 'want to read', reading: 'reading', finished: 'finished' }

// The signed-in user's reading list (wishlist with a status per book).
export default function ReadingListProvider({ children }) {
  const { user } = useAuth()
  const toast = useToast()
  const [state, setState] = useState({ uid: null, list: [] })
  const uid = user?.id ?? null

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    api('/api/me/reading-list')
      .then((list) => !cancelled && setState({ uid, list }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [uid])

  const list = useMemo(() => (uid && state.uid === uid ? state.list : []), [uid, state])
  const statusOf = useCallback((id) => list.find((e) => e.book._id === id)?.status || null, [list])

  const setStatus = useCallback(
    async (book, status) => {
      if (!uid) {
        toast.info('Log in to save books to your reading list.')
        return false
      }
      try {
        const next = status
          ? await api(`/api/me/reading-list/${book._id}`, { method: 'PUT', body: { status } })
          : await api(`/api/me/reading-list/${book._id}`, { method: 'DELETE' })
        setState({ uid, list: next })
        toast.success(status ? `"${book.title}" marked as ${LABEL[status]}.` : `Removed "${book.title}" from your reading list.`)
        return true
      } catch (err) {
        toast.error(err.message)
        return false
      }
    },
    [uid, toast]
  )

  const value = useMemo(() => ({ list, statusOf, setStatus }), [list, statusOf, setStatus])
  return <ReadingCtx.Provider value={value}>{children}</ReadingCtx.Provider>
}
