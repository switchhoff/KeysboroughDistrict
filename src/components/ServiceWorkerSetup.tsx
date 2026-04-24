'use client'

import { useEffect, useState } from 'react'
import { getStoredAuth } from '@/lib/auth'
import { registerPush } from '@/lib/push'
import { RefreshCw, X } from 'lucide-react'

export default function ServiceWorkerSetup() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[SW] registered', reg.scope)

      // Detect updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true)
          }
        })
      })
    }).catch(err => {
      console.error('[SW] registration failed', err)
    })

    // If already logged in, ensure push subscription is active
    const auth = getStoredAuth()
    if (auth) {
      registerPush(auth.playerId)
    }

    // Manual update check on focus
    const checkUpdates = () => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update()
      })
    }

    window.addEventListener('focus', checkUpdates)
    return () => window.removeEventListener('focus', checkUpdates)
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[9999] animate-in slide-in-from-bottom-8 duration-500">
      <div className="max-w-lg mx-auto bg-club-red text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border-2 border-white/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-white animate-spin-slow" />
          </div>
          <div>
            <p className="font-bold text-sm">Update Available</p>
            <p className="text-[11px] text-white/80 leading-tight">A new version of KDFC MOTM is ready.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-club-red px-4 py-2 rounded-xl text-xs font-black shadow-sm hover:bg-gray-50 transition-colors"
          >
            RELOAD
          </button>
          <button
            onClick={() => setUpdateAvailable(false)}
            className="p-1 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
