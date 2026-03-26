import { FanAuthState } from './types'

const FAN_AUTH_KEY = 'fan_auth'

export function getStoredFanAuth(): FanAuthState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FAN_AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeFanAuth(state: FanAuthState) {
  localStorage.setItem(FAN_AUTH_KEY, JSON.stringify(state))
}

export function clearFanAuth() {
  localStorage.removeItem(FAN_AUTH_KEY)
}
