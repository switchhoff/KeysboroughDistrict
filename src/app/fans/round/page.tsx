'use client'

import { useEffect, useState, Suspense } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ChevronLeft, ChevronRight, Trophy, BarChart2 } from 'lucide-react'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function FanRoundInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roundId = searchParams.get('roundId') ?? ''

  const [round, setRound] = useState<Round | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getStoredFanAuth()
    if (!auth) { router.replace('/fans'); return }
    if (!roundId) { router.replace('/fans/rounds'); return }
    loadRound()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  const loadRound = async () => {
    try {
      const snap = await getDoc(doc(db, 'rounds', roundId))
      if (!snap.exists()) { router.replace('/fans/rounds'); return }
      setRound({ id: snap.id, ...snap.data() } as Round)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )
  if (!round) return null

  const teams: Array<{ key: 'seniors' | 'reserves'; label: string }> = [
    { key: 'seniors', label: 'Seniors' },
    { key: 'reserves', label: 'Reserves' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-club-red text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link href="/fans/rounds" className="flex items-center gap-1 text-red-200 text-sm mb-3 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" /> All Rounds
          </Link>
          <p className="text-red-200 text-sm font-semibold uppercase tracking-widest mb-1">Round {round.roundNumber}</p>
          <h1 className="text-2xl font-black">vs {round.opponent}</h1>
          <p className="text-red-100 text-sm mt-1">{formatDate(round.date)} · {round.venue === 'home' ? 'Home' : 'Away'}</p>
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        <p className="text-sm text-gray-500">Select a team to see the fan vote, teamsheet, and player shoutouts.</p>

        {teams.map(({ key, label }) => {
          const teamsheet = round.teamsheets[key] ?? []
          const result = round.results?.[key]
          const hasData = teamsheet.length > 0

          return (
            <Link
              key={key}
              href={hasData ? `/fans/vote?roundId=${round.id}&team=${key}` : '#'}
              className={`block bg-white border rounded-2xl px-4 py-4 transition-all group ${
                hasData
                  ? 'border-gray-100 hover:border-club-red/30 hover:shadow-sm cursor-pointer'
                  : 'border-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-club-red/10 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-club-red" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{label}</div>
                    {result ? (
                      <div className="text-sm font-semibold text-gray-600 mt-0.5">
                        {result.goalsFor} – {result.goalsAgainst}
                        <span className="ml-2 text-xs font-medium text-gray-400">
                          {result.goalsFor > result.goalsAgainst ? 'Win' :
                           result.goalsFor < result.goalsAgainst ? 'Loss' : 'Draw'}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {hasData ? 'Result pending' : 'Teamsheet not set'}
                      </div>
                    )}
                    {hasData && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-club-red font-semibold">
                        <BarChart2 className="w-3 h-3" />
                        Fan votes · Shoutouts
                      </div>
                    )}
                  </div>
                </div>
                {hasData && (
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-club-red transition-colors" />
                )}
              </div>
            </Link>
          )
        })}
      </main>
    </div>
  )
}

export default function FanRoundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    }>
      <FanRoundInner />
    </Suspense>
  )
}
