'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { Player } from '@/lib/types'
import { storeAuth, generateAuthToken, getStoredAuth } from '@/lib/auth'
import { registerPush } from '@/lib/push'
import { useRouter } from 'next/navigation'
import { Search, Eye, EyeOff, Loader2 } from 'lucide-react'
import Toast from '@/components/Toast'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isNewPlayer, setIsNewPlayer] = useState(false)
  const [focused, setFocused] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const auth = getStoredAuth()
    if (auth) { router.replace('/'); return }
    fetchPlayers()
  }, [router])

  const fetchPlayers = async () => {
    try {
      const snap = await getDocs(collection(db, 'players'))
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)))
    } catch {
      setToast({ message: 'Failed to load players. Check connection.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const filtered = players
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSelectPlayer = (player: Player) => {
    setSelected(player)
    setSearch(player.name)
    setIsNewPlayer(!player.pin && !player.hasPin)
    setPin('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || pin.length !== 4) return
    setSubmitting(true)
    try {
      if (isNewPlayer) {
        // New player — set PIN via Cloud Function (hashes server-side, stores in /playerPins)
        const setPin = httpsCallable(functions, 'setPin')
        await setPin({ playerId: selected.id, pin })
      } else {
        // Existing player — verify PIN server-side against stored hash
        const verifyPin = httpsCallable(functions, 'verifyPin')
        await verifyPin({ playerId: selected.id, pin })
      }
      const token = generateAuthToken(selected.id, pin)
      storeAuth({ playerId: selected.id, authToken: token, name: selected.name, role: selected.role })
      registerPush(selected.id)
      router.replace('/')
    } catch (err: unknown) {
      console.error('[login] verifyPin error:', err)
      const code = (err as { code?: string }).code
      console.log('[login] error code:', code)
      if (code === 'functions/permission-denied') {
        setToast({ message: 'Incorrect PIN. Try again.', type: 'error' })
        setPin('')
      } else {
        setToast({ message: 'Something went wrong. Try again.', type: 'error' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #c01e1e 0%, #8f1414 55%, #124425 100%)' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Splash */}
      <div className="flex flex-col items-center justify-center pt-16 pb-10 text-white text-center px-6">
        <div className="w-28 h-28 mb-5 drop-shadow-2xl">
          <Image src="/logo.png" alt="Keysborough District FC" width={112} height={112} className="rounded-full" priority />
        </div>
        <h1 className="text-2xl font-black tracking-tight leading-tight">Keysborough District FC</h1>
        <p className="text-white/70 mt-1 text-sm font-medium tracking-wide uppercase">Man of the Match</p>
      </div>

      {/* Card */}
      <div className="flex-1 bg-white rounded-t-3xl px-5 pt-8 pb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Who are you?</h2>
        <p className="text-gray-500 text-sm mb-6">Select your name to get started</p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-club-red" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!selected ? (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search your name..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelected(null) }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  className="input-field pl-11"
                  autoFocus
                />
                {focused && !selected && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg z-10 max-h-56 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">No players found</div>
                    ) : (
                      filtered.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPlayer(p)}
                          className="w-full text-left px-4 py-3.5 text-sm font-medium text-gray-900 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                        >
                          {p.name}
                          {p.role === 'admin' && (
                            <span className="ml-2 text-xs text-club-red font-semibold">Admin</span>
                          )}
                          {p.role === 'coach' && (
                            <span className="ml-2 text-xs text-club-green font-semibold">Coach</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-club-red-light border border-club-red/20 rounded-xl px-4 py-3.5">
                <div>
                  <div className="font-semibold text-gray-900">{selected.name}</div>
                  <div className="text-xs text-gray-500">Keysborough District FC</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setSearch(''); setPin('') }}
                  className="text-xs text-club-red font-semibold"
                >
                  Change
                </button>
              </div>
            )}

            {selected && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isNewPlayer ? 'Set your 4-digit PIN' : 'Enter your PIN'}
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="••••"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="input-field pr-12 text-center text-xl font-bold tracking-widest"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isNewPlayer && (
                  <p className="text-xs text-gray-500 mt-2">
                    You&apos;ll use this PIN every time you log in. Don&apos;t forget it!
                  </p>
                )}
              </div>
            )}

            {selected && (
              <button type="submit" disabled={pin.length !== 4 || submitting} className="btn-primary mt-2">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </span>
                ) : "Let's Go →"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
