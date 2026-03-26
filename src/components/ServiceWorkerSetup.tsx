'use client'

import { useEffect } from 'react'
import { getStoredAuth } from '@/lib/auth'
import { registerPush } from '@/lib/push'

export default function ServiceWorkerSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[SW] registered', reg.scope)
    }).catch(err => {
      console.error('[SW] registration failed', err)
    })

    // If already logged in, ensure push subscription is active
    const auth = getStoredAuth()
    if (auth) {
      registerPush(auth.playerId)
    }
  }, [])

  return null
}
