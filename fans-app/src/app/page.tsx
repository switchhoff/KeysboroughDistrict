'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, doc, getDoc, addDoc, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Fan, FanAuthState } from '@/lib/types'
import { storeFanAuth, getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'
import FanHeader from '@/components/FanHeader'
import { Loader2, ChevronRight, UserPlus, Eye, EyeOff } from 'lucide-react'

type View = 'list' | 'pin' | 'register'

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

  const handleSelectFan = (fan: Fan) => {
    setSelectedFan(fan)
    setPin('')
    setError('')
    setView('pin')
  }

  const handleLogin = async () => {
    if (!selectedFan || pin.length < 4) return
    setSubmitting(true)
    setError('')
    try {
      const snap = await getDoc(doc(db, 'fans', selectedFan.id))
      if (!snap.exists()) { setError('Fan not found.'); return }
      const fan = snap.data() as Fan
      if (fan.pin !== pin) { setError('Incorrect PIN. Try again.'); return }
      const auth: FanAuthState = { fanId: selectedFan.id, fanName: selectedFan.name }
      storeFanAuth(auth)
      router.replace('/rounds')
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
      const ref = await addDoc(collection(db, 'fans'), {
        name: newName.trim(),
        pin: newPin,
        createdAt: Date.now(),
      })
      const auth: FanAuthState = { fanId: ref.id, fanName: newName.trim() }
      storeFanAuth(auth)
      router.replace('/rounds')
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
            <input
              type="text"
              placeholder="Search fans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-white"
            />
            <button
              onClick={() => { setView('register'); setError('') }}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl px-4 py-4 text-sm font-semibold text-gray-400 hover:border-club-red/40 hover:text-club-red transition-all"
            >
              <UserPlus className="w-4 h-4" />
              New fan? Register here
            </button>
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
      </main>
    </div>
  )
}
