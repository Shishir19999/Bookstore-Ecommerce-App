import { useEffect, useState } from 'react'
import { api } from '../api'
import { SettingsCtx } from './contexts'
import { DEFAULT_SETTINGS, COUNTRIES } from '../shared/rules.mjs'

// Store rules (shipping, tax, loyalty, return window) shared with the server; falls back to the defaults offline.
export default function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, countries: COUNTRIES })
  useEffect(() => {
    let cancelled = false
    api('/api/settings/public')
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return <SettingsCtx.Provider value={settings}>{children}</SettingsCtx.Provider>
}
