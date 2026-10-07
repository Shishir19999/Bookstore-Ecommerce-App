import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DEMO } from '../api'
import { useAuth, useTitle, useToast } from '../hooks'
import { DEMO_ACCOUNTS } from '../demo/accounts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Login / register form with inline validation. In the browser-only demo the documented demo logins are shown.
export default function Auth({ mode }) {
  const register = mode === 'register'
  useTitle(register ? 'Create account' : 'Log in')
  const { user, login, register: signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const loc = useLocation()
  const from = loc.state?.from || '/'
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  const validate = (v) => {
    const e = {}
    if (register && !v.name.trim()) e.name = 'Enter your name.'
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.'
    if (!v.password) e.password = 'Enter your password.'
    else if (register && v.password.length < 6) e.password = 'Use at least 6 characters.'
    return e
  }

  const submit = async (e, creds = f) => {
    e?.preventDefault()
    const errs = validate(creds)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (register) await signUp(creds.name.trim(), creds.email.trim(), creds.password)
      else await login(creds.email.trim(), creds.password)
      toast.success(register ? 'Welcome to Folio Books!' : 'Welcome back!')
      navigate(from, { replace: true })
    } catch (err) {
      setFailure(err.message)
      setBusy(false)
    }
  }

  const fill = (acc) => {
    const creds = { name: '', email: acc.email, password: acc.password }
    setF(creds)
    submit(null, creds)
  }

  const bind = (k) => ({
    value: f[k],
    onChange: (e) => setF({ ...f, [k]: e.target.value }),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `${k}-err` : undefined,
  })

  return (
    <div className="container page">
      <div className="auth card">
        <h1 style={{ fontSize: '2rem' }}>{register ? 'Create your account' : 'Log in'}</h1>
        <form onSubmit={submit} noValidate>
          {register && (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" className="input" autoComplete="name" {...bind('name')} />
              {errors.name && <span className="err" id="name-err">{errors.name}</span>}
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" className="input" autoComplete="email" placeholder="you@example.com" {...bind('email')} />
            {errors.email && <span className="err" id="email-err">{errors.email}</span>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" className="input" autoComplete={register ? 'new-password' : 'current-password'} {...bind('password')} />
            {errors.password && <span className="err" id="password-err">{errors.password}</span>}
          </div>
          {failure && <p className="alert alert-error" role="alert">{failure}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait...' : register ? 'Create account' : 'Log in'}</button>
        </form>
        <p className="small" style={{ marginTop: 16, marginBottom: 0 }}>
          {register ? <>Already have an account? <Link to="/login" state={loc.state}>Log in</Link></> : <>New here? <Link to="/register" state={loc.state}>Create an account</Link></>}
        </p>
        {DEMO && !register && (
          <div className="demo-logins" aria-label="Demo logins">
            <strong>Demo logins</strong>
            <div className="small">These accounts exist only in your browser. Password for both: <code>{DEMO_ACCOUNTS[0].password}</code></div>
            {DEMO_ACCOUNTS.map((a) => (
              <div className="row between" key={a.email}>
                <span className="small"><strong>{a.role === 'admin' ? 'Admin' : 'Shopper'}:</strong> <code>{a.email}</code></span>
                <button type="button" className="btn btn-sm" onClick={() => fill(a)} disabled={busy}>Use {a.role}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
