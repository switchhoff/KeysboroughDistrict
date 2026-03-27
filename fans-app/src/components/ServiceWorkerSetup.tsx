'use client'

import { useEffect } from 'react'

export default function ServiceWorkerSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {/* silent */})
  }, [])

  return null
}
