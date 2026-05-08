'use client'

import { useEffect, useRef, useState } from 'react'
import { collection, getDocs, doc, addDoc, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { Fan, FanAuthState } from '@/lib/types'
import { storeFanAuth, getStoredFanAuth } from '@/lib/fanAuth'
import { getPushState, subscribeToPush } from '@/lib/pushNotifications'
import { useRouter } from 'next/navigation'
import FanHeader from '@/components/FanHeader'
import { Loader2, ChevronRight, UserPlus, Eye, EyeOff, Bell } from 'lucide-react'

type View = 'list' | 'pin' | 'set-pin' | 'register' | 'notify'

const MAX_ATTEMPTS   = 5
const LOCKOUT_MS     = 5 * 60 * 1000  // 5 minutes

function getLockout(fanId: string): { attempts: number; lockedUntil: number } {
  try {
    return JSON.parse(localStorage.getItem(`kpp_lockout_${fanId}`) ?? '{}')
  } catch { return { attempts: 0, lockedUntil: 0 } }
}
function setLockout(fanId: string, attempts: number, lockedUntil: number) {
  localStorage.setItem(`kpp_lockout_${fanId}`, JSON.stringify({ attempts, lockedUntil }))
}
function clearLockout(fanId: string) {
  localStorage.removeItem(`kpp_lockout_${fanId}`)
}

export default function FansPage() {
  const router = useRouter()
  const [fans, setFans] = useState<Fan[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selectedFan, setSelectedFan] = useState<Fan | null>(null)
  const [pin, setPin] = useState('')
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [lockedSecsLeft, setLockedSecsLeft] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [pendingFanId,  setPendingFanId]  = useState<string | null>(null)
  const [notifLoading,  setNotifLoading]  = useState(false)

  useEffect(() => {
    const stored = getStoredFanAuth()
    if (stored) { router.replace('/rounds'); return }
    loadFans()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFans = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'fans'), orderBy('name')))
      setFans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Fan)))
    } finally {
      setLoading(false)
    }
  }

  const startCountdown = (lockedUntil: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    const tick = () => {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (secs <= 0) {
        setLockedSecsLeft(0)
        clearInterval(countdownRef.current!)
      } else {
        setLockedSecsLeft(secs)
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
  }

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  const goAfterAuth = (fanId: string, auth: FanAuthState) => {
    storeFanAuth(auth)
    const state = getPushState()
    if (state === 'default') {
      setPendingFanId(fanId)
      setView('notify')
    } else {
      router.replace('/rounds')
    }
  }

  const resetSetPin = () => {
    setNewPin('')
    setConfirmPin('')
    setShowPin(false)
    setError('')
  }

  const handleSelectFan = (fan: Fan) => {
    setSelectedFan(fan)
    setPin('')
    setError('')
    const { lockedUntil } = getLockout(fan.id)
    if (lockedUntil > Date.now()) startCountdown(lockedUntil)
    else setLockedSecsLeft(0)
    if (!fan.pin && !fan.hasPin) {
      resetSetPin()
      setView('set-pin')
    } else {
      setView('pin')
    }
  }

  const handleLogin = async () => {
    if (!selectedFan || pin.length < 4) return

    // Check lockout
    const lockout = getLockout(selectedFan.id)
    if (lockout.lockedUntil > Date.now()) return

    setSubmitting(true)
    setError('')
    try {
      const verifyFanPin = httpsCallable(functions, 'verifyFanPin')
      await verifyFanPin({ fanId: selectedFan.id, pin })

      clearLockout(selectedFan.id)
      const auth: FanAuthState = { fanId: selectedFan.id, fanName: selectedFan.name }
      goAfterAuth(selectedFan.id, auth)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'functions/permission-denied') {
        const attempts = (lockout.attempts ?? 0) + 1
        const remaining = MAX_ATTEMPTS - attempts
        if (attempts >= MAX_ATTEMPTS) {
          const lockedUntil = Date.now() + LOCKOUT_MS
          setLockout(selectedFan.id, attempts, lockedUntil)
          startCountdown(lockedUntil)
          setError('Too many attempts. Try again in 5 minutes.')
        } else {
          setLockout(selectedFan.id, attempts, 0)
          setError(`Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`)
        }
        setPin('')
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetPin = async () => {
    if (!selectedFan) return
    if (newPin.length < 4) { setError('PIN must be at least 4 digits.'); return }
    if (newPin !== confirmPin) { setError("PINs don't match."); return }
    setSubmitting(true)
    setError('')
    try {
      const setFanPin = httpsCallable(functions, 'setFanPin')
      await setFanPin({ fanId: selectedFan.id, pin: newPin })
      const auth: FanAuthState = { fanId: selectedFan.id, fanName: selectedFan.name }
      goAfterAuth(selectedFan.id, auth)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async () => {
    if (!newName.trim()) { setError('Please enter your name.'); return }
    if (newPin.length < 4) { setError('PIN must be at least 4 digits.'); return }
    if (newPin !== confirmPin) { setError("PINs don't match."); return }
    setSubmitting(true)
    setError('')
    try {
      // Create fan doc without PIN — setFanPin stores only the hash
      const ref = await addDoc(collection(db, 'fans'), {
        name: newName.trim(),
        createdAt: Date.now(),
      })
      const setFanPin = httpsCallable(functions, 'setFanPin')
      await setFanPin({ fanId: ref.id, pin: newPin })
      const auth: FanAuthState = { fanId: ref.id, fanName: newName.trim() }
      goAfterAuth(ref.id, auth)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = fans.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <FanHeader />

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {view === 'list' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Who are you?</h2>
              <p className="text-sm text-gray-500 mt-0.5">Pick your name to log in, or register as a new fan.</p>
            </div>
            <button
              onClick={() => { setView('register'); setNewName(''); setNewPin(''); setConfirmPin(''); setShowPin(false); setError('') }}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl px-4 py-4 text-sm font-semibold text-gray-400 hover:border-club-red/40 hover:text-club-red transition-all"
            >
              <UserPlus className="w-4 h-4" />
              New fan? Register here
            </button>
            <input
              type="text"
              placeholder="Search fans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white"
            />
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">
                  {search ? 'No fans match your search.' : 'No fans yet — be the first!'}
                </p>
              )}
              {filtered.map(fan => (
                <button
                  key={fan.id}
                  onClick={() => handleSelectFan(fan)}
                  className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-club-red/30 hover:shadow-sm transition-all group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-club-red">{fan.name[0].toUpperCase()}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{fan.name}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-club-red transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'pin' && selectedFan && (
          <div className="space-y-4">
            <button onClick={() => { setView('list'); setError('') }} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-black text-club-red">{selectedFan.name[0].toUpperCase()}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Welcome back</h2>
                <p className="text-sm text-gray-500">{selectedFan.name}</p>
              </div>
            </div>
            {lockedSecsLeft > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center space-y-2">
                <div className="text-3xl font-black text-red-500 tabular-nums">
                  {Math.floor(lockedSecsLeft / 60)}:{String(lockedSecsLeft % 60).padStart(2, '0')}
                </div>
                <p className="text-sm font-semibold text-red-700">Account temporarily locked</p>
                <p className="text-xs text-red-400">Too many incorrect PIN attempts. Please wait.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    placeholder="Enter your PIN"
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white pr-12"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                <button onClick={handleLogin} disabled={pin.length < 4 || submitting} className="btn-primary">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enter Fan Zone →'}
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'set-pin' && selectedFan && (
          <div className="space-y-4">
            <button onClick={() => { setView('list'); setError('') }} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-black text-club-red">{selectedFan.name[0].toUpperCase()}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Set your PIN</h2>
                <p className="text-sm text-gray-500">Hi {selectedFan.name}! Create a PIN to secure your account.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="Choose a 4-digit PIN"
                  value={newPin}
                  onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSetPin()}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white pr-12"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="Confirm PIN"
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSetPin()}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white"
              />
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <button onClick={handleSetPin} disabled={newPin.length < 4 || submitting} className="btn-primary">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Set PIN & Enter Fan Zone →'}
              </button>
            </div>
          </div>
        )}

        {view === 'register' && (
          <div className="space-y-4">
            <button onClick={() => { setView('list'); setError('') }} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Join the Fan Zone</h2>
              <p className="text-sm text-gray-500 mt-0.5">Create your fan profile to vote and send shoutouts.</p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name"
                value={newName}
                onChange={e => { setNewName(e.target.value); setError('') }}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white"
              />
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="Choose a 4-digit PIN"
                  value={newPin}
                  onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white pr-12"
                />
                <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="Confirm PIN"
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white"
              />
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <button
                onClick={handleRegister}
                disabled={!newName.trim() || newPin.length < 4 || submitting}
                className="btn-primary"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Profile →'}
              </button>
            </div>
          </div>
        )}
        {view === 'notify' && (
          <div className="space-y-5 py-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-club-red/10 flex items-center justify-center">
                <Bell className="w-8 h-8 text-club-red" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">Stay in the loop</h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  Get notified for goals, kick off, half time and full time — even when the app is closed.
                </p>
              </div>
            </div>
            <button
              disabled={notifLoading}
              onClick={async () => {
                if (!pendingFanId) { router.replace('/rounds'); return }
                setNotifLoading(true)
                try { await subscribeToPush(pendingFanId) } finally { setNotifLoading(false) }
                router.replace('/rounds')
              }}
              className="w-full flex items-center justify-center gap-2 bg-club-red text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-club-red/90 transition-colors disabled:opacity-60"
            >
              {notifLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Bell className="w-4 h-4" /> Enable Notifications</>}
            </button>
            <button
              onClick={() => router.replace('/rounds')}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
