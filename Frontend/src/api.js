export const DEMO = import.meta.env.VITE_DEMO === 'true'
export const API_URL = DEMO ? '' : import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Uploaded covers are stored as /uploads/... on the API server; external covers are full URLs (or data: URLs in the demo).
export const imageSrc = (img) => (img && img.startsWith('/uploads/') ? API_URL + img : img)

export const TOKEN_KEY = 'bookstore_token'

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

// fetch wrapper: adds JSON + auth headers, throws Error(message) on non-2xx.
// In the browser-only demo build (VITE_DEMO=true) the same calls are answered by the in-browser demo backend;
// the condition is a build-time constant, so normal builds drop the demo code entirely.
export async function api(path, { method = 'GET', body, token } = {}) {
  if (import.meta.env.VITE_DEMO === 'true') {
    const { demoRequest } = await import('./demo/server.js')
    return demoRequest(path, { method, body, token: token ?? getToken() })
  }

  const headers = {}
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  const t = token ?? getToken()
  if (t) headers.Authorization = `Bearer ${t}`

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}
