import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThemeCtx, ToastCtx, ConfirmCtx } from './contexts'

const THEME_KEY = 'bookstore_theme'
const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const storedTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

function ThemeProvider({ children }) {
  const [explicit, setExplicit] = useState(storedTheme)
  const [system, setSystem] = useState(systemTheme)
  const theme = explicit || system

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#14110f' : '#faf6f0')
  }, [theme])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setExplicit(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (type, message) => {
      const id = ++idRef.current
      setToasts((t) => [...t.slice(-3), { id, type, message }])
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000)
    },
    [dismiss]
  )
  const api = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push]
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const dialogRef = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), [])

  useEffect(() => {
    const d = dialogRef.current
    if (state && d && !d.open) d.showModal()
  }, [state])

  const close = (result) => {
    dialogRef.current?.close()
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <dialog
          ref={dialogRef}
          className="dialog"
          role="alertdialog"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-msg"
          onCancel={(e) => {
            e.preventDefault()
            close(false)
          }}
          onClick={(e) => e.target === dialogRef.current && close(false)}
        >
          <h2 id="confirm-title">{state.title || 'Are you sure?'}</h2>
          <p id="confirm-msg">{state.message}</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => close(false)} autoFocus>
              {state.cancelLabel || 'Cancel'}
            </button>
            <button type="button" className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {state.confirmLabel || 'Confirm'}
            </button>
          </div>
        </dialog>
      )}
    </ConfirmCtx.Provider>
  )
}

export default function UIProvider({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
