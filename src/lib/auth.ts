import { useEffect, useState } from 'react'
import { AuthState } from './types'

const AUTH_KEY = 'kpp_auth'

export function getStoredAuth(): AuthState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthState
  } catch {
    return null
  }
}

export function storeAuth(auth: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function generateAuthToken(playerId: string, pin: string): string {
  return btoa(`${playerId}:${pin}:${Date.now()}`)
}

/** Hydration-safe auth hook.
 *  Returns `undefined` on first render (matches static HTML), then resolves to
 *  the real value after mount. Components should treat `undefined` as "loading". */
export function useAuth(): AuthState | null | undefined {
  const [auth, setAuth] = useState<AuthState | null | undefined>(undefined)
  useEffect(() => { setAuth(getStoredAuth()) }, [])
  return auth
}
