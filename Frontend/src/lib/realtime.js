// Real-time book club updates: Socket.IO against the real API, BroadcastChannel (other tabs) in the live preview.
import { API_URL } from '../api'

let socketPromise = null
const CHANNEL = 'folio-preview-realtime'

// subscribe('club:<id>', (event, payload) => ...) -> unsubscribe()
export function subscribe(room, handler) {
  if (import.meta.env.VITE_DEMO === 'true') {
    if (typeof BroadcastChannel !== 'function') return () => {}
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => e.data?.room === room && handler(e.data.event, e.data.payload)
    return () => ch.close()
  }
  let off = () => {}
  let cancelled = false
  socketPromise ||= import('socket.io-client').then(({ io }) => io(API_URL, { transports: ['websocket', 'polling'] }))
  socketPromise
    .then((socket) => {
      if (cancelled) return
      const events = ['post', 'thread', 'pick', 'post-removed']
      const fns = events.map((ev) => [ev, (payload) => handler(ev, payload)])
      const clubId = room.replace('club:', '')
      const join = () => socket.emit('join', clubId)
      join()
      socket.on('connect', join)
      fns.forEach(([ev, fn]) => socket.on(ev, fn))
      off = () => {
        socket.emit('leave', clubId)
        socket.off('connect', join)
        fns.forEach(([ev, fn]) => socket.off(ev, fn))
      }
    })
    .catch(() => {})
  return () => {
    cancelled = true
    off()
  }
}
