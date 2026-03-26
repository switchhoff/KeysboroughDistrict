'use client'

import { useEffect, useState, Suspense } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth'
import { Round, Player, Vote, Team } from '@/lib/types'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { ChevronDown, Loader2, Trophy, Star, Medal, CheckCircle } from 'lucide-react'

const POINTS = [
  { label: '3 Points', key: 'points3' as const, color: 'text-gold', bg: 'bg-amber-50 border-amber-200', icon: Trophy, description: 'Best player' },
  { label: '2 Points', key: 'points2' as const, color: 'text-silver', bg: 'bg-gray-50 border-gray-200', icon: Star, description: 'Runner-up' },
  { label: '1 Point', key: 'points1' as const, color: 'text-bronze', bg: 'bg-orange-50 border-orange-200', icon: Medal, description: 'Third place' },
]

type Selections = { points3: string; points2: string; points1: string }

function VotePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roundId = searchParams.get('roundId') ?? ''
  const team = (searchParams.get('team') ?? 'reserves') as Team

  const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

  const auth = useAuth()
  const [round, setRound] = useState<Round | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selections, setSelections] = useState<Selections>({ points3: '', points2: '', points1: '' })
  const [existingVote, setExistingVote] = useState<Vote | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (auth === undefined) return
    if (!auth) { router.replace('/login'); return }
    if (!roundId) { router.replace('/'); return }
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, roundId, team])

  const loadData = async () => {
    try {
      const roundDoc = await getDoc(doc(db, 'rounds', roundId))
      if (!roundDoc.exists()) { router.replace('/'); return }
      const roundData = { id: roundDoc.id, ...roundDoc.data() } as Round
      setRound(roundData)

      // Check if vote already submitted — load it for read-only view
      const voteId = `${team}_${auth!.playerId}`
      const voteDoc = await getDoc(doc(db, 'rounds', roundId, 'votes', voteId))
      if (voteDoc.exists()) {
        const vote = { id: voteDoc.id, ...voteDoc.data() } as Vote
        setExistingVote(vote)
        // Also load all team players for name lookups
        const teamsheet = roundData.teamsheets[team]
        const playerDocs = await Promise.all(teamsheet.map(id => getDoc(doc(db, 'players', id))))
        setPlayers(playerDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() } as Player)))
        return
      }

      const teamsheet = roundData.teamsheets[team]
      const playerDocs = await Promise.all(
        teamsheet.map(id => getDoc(doc(db, 'players', id)))
      )
      const teamPlayers = playerDocs
        .filter(d => d.exists())
        .map(d => ({ id: d.id, ...d.data() } as Player))
        .filter(p => p.id !== auth!.playerId)
        .sort((a, b) => a.name.localeCompare(b.name))

      setPlayers(teamPlayers)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (key: keyof Selections, value: string) => {
    setSelections(prev => {
      const next = { ...prev, [key]: value }
      const others = (Object.keys(next) as (keyof Selections)[]).filter(k => k !== key)
      for (const other of others) {
        if (next[other] === value && value !== '') next[other] = ''
      }
      return next
    })
  }

  const isValid = !!(selections.points3 && selections.points2 && selections.points1 &&
    new Set([selections.points3, selections.points2, selections.points1]).size === 3)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || !auth || submitting) return
    setSubmitting(true)
    try {
      const voteId = `${team}_${auth.playerId}`
      const vote: Vote = {
        id: voteId,
        voterId: auth.playerId,
        roundId,
        team,
        points3: selections.points3,
        points2: selections.points2,
        points1: selections.points1,
        timestamp: Date.now(),
      }
      await setDoc(doc(db, 'rounds', roundId, 'votes', voteId), vote)
      router.replace('/')
    } catch {
      setToast({ message: 'Failed to submit. Try again.', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const getAvailablePlayers = (key: keyof Selections) => {
    const otherKeys = (Object.keys(selections) as (keyof Selections)[]).filter(k => k !== key)
    const taken = otherKeys.map(k => selections[k]).filter(Boolean)
    return players.filter(p => !taken.includes(p.id) || selections[key] === p.id)
  }

  if (!auth) return null

  return (
    <div className="min-h-screen flex flex-col">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Header title={round ? `Round ${round.roundNumber}` : 'Vote'} showBack />

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-club-red" />
          </div>
        ) : existingVote ? (
          /* ── Read-only: show submitted vote ── */
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-gray-900">Your Vote</h2>
              <p className="text-gray-500 text-sm mt-0.5">
                {TEAM_LABEL[team]} · vs {round?.opponent}{round?.venue ? ` · ${round.venue === 'home' ? 'Home' : 'Away'}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-club-green/10 border border-club-green/20 rounded-2xl px-4 py-3">
              <CheckCircle className="w-4 h-4 text-club-green shrink-0" />
              <span className="text-sm font-semibold text-club-green">Submitted</span>
            </div>

            {POINTS.map(({ label, key, color, bg, icon: Icon }) => {
              const player = players.find(p => p.id === existingVote[key])
              return (
                <div key={key} className={`rounded-2xl border-2 p-4 ${bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className={`font-bold text-sm ${color}`}>{label}</span>
                  </div>
                  <div className="font-semibold text-gray-900 text-base">
                    {player?.name ?? <span className="text-gray-400 italic">Unknown player</span>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── Voting form ── */
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="mb-1">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-black text-gray-900">Cast Your Vote</h2>
                {(selections.points3 || selections.points2 || selections.points1) && (
                  <button
                    type="button"
                    onClick={() => setSelections({ points3: '', points2: '', points1: '' })}
                    className="text-xs font-semibold text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Reset all
                  </button>
                )}
              </div>
              <p className="text-gray-500 text-sm mt-0.5">
                {TEAM_LABEL[team]} · vs {round?.opponent}{round?.venue ? ` · ${round.venue === 'home' ? 'Home' : 'Away'}` : ''}
              </p>
            </div>

            {POINTS.map(({ label, key, color, bg, icon: Icon }) => (
              <div key={key} className={`rounded-2xl border-2 p-3 ${bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <div className={`font-bold text-sm ${color}`}>{label}</div>
                </div>
                <div className="relative">
                  <select
                    value={selections[key]}
                    onChange={e => handleSelect(key, e.target.value)}
                    className="select-field text-sm font-medium bg-white py-2.5"
                  >
                    <option value="">Select a player...</option>
                    {getAvailablePlayers(key).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            ))}

            {isValid && (
              <div className="bg-club-red/5 border border-club-red/20 rounded-2xl px-4 py-3">
                <div className="text-xs font-semibold text-club-red uppercase tracking-wide mb-1.5">Your Votes</div>
                {POINTS.map(({ label, key, color }) => {
                  const player = players.find(p => p.id === selections[key])
                  return (
                    <div key={key} className="flex justify-between py-0.5">
                      <span className={`text-sm font-semibold ${color}`}>{label}</span>
                      <span className="text-sm text-gray-700 font-medium">{player?.name ?? '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <button type="submit" disabled={!isValid || submitting} className="btn-primary">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </span>
              ) : 'Submit Vote →'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}

export default function VotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    }>
      <VotePageInner />
    </Suspense>
  )
}
