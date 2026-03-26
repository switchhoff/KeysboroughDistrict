'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round } from '@/lib/types'
import { getStoredFanAuth, clearFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Calendar, ChevronRight, Clock, CheckCircle, LogOut } from 'lucide-react'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

type RoundStatus = 'upcoming' | 'live' | 'completed'

function getRoundStatus(round: Round): RoundStatus {
  const now = new Date()
  const kickOff = new Date(`${round.date}T${round.kickOffTime ?? '15:00'}`)
  const end = new Date(kickOff.getTime() + 4 * 60 * 60 * 1000) // ~4hrs after kick-off
  if (now < kickOff) return 'upcoming'
  if (now < end && !round.results?.seniors && !round.results?.reserves) return 'live'
  return 'completed'
}

export default function FanRoundsPage() {
  const router = useRouter()
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [fanName, setFanName] = useState('')

  useEffect(() => {
    const auth = getStoredFanAuth()
    if (!auth) { router.replace('/fans'); return }
    setFanName(auth.fanName)
    loadRounds()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRounds = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'rounds'), orderBy('roundNumber', 'desc')))
      setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Round)))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => { clearFanAuth(); router.replace('/fans') }

  const upcoming = rounds.filter(r => getRoundStatus(r) === 'upcoming').reverse()
  const live = rounds.filter(r => getRoundStatus(r) === 'live')
  const completed = rounds.filter(r => getRoundStatus(r) === 'completed')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  const RoundCard = ({ round }: { round: Round }) => {
    const status = getRoundStatus(round)
    return (
      <Link href={`/fans/round?roundId=${round.id}`}>
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-4 hover:border-club-red/30 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                status === 'live' ? 'bg-green-100' :
                status === 'completed' ? 'bg-gray-100' : 'bg-club-red/10'
              }`}>
                {status === 'live' ? <Clock className="w-5 h-5 text-green-600" /> :
                 status === 'completed' ? <CheckCircle className="w-5 h-5 text-gray-400" /> :
                 <Calendar className="w-5 h-5 text-club-red" />}
              </div>
              <div>
                <div className="font-bold text-gray-900">vs {round.opponent}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatDate(round.date)} · Rd {round.roundNumber}
                </div>
                {status === 'completed' && round.results && (
                  <div className="flex gap-2 mt-1">
                    {round.results.seniors && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                        Snr {round.results.seniors.goalsFor}–{round.results.seniors.goalsAgainst}
                      </span>
                    )}
                    {round.results.reserves && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                        Res {round.results.reserves.goalsFor}–{round.results.reserves.goalsAgainst}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status === 'live' && (
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2.5 py-1 rounded-full animate-pulse">
                  Live
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-club-red transition-colors" />
            </div>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-club-red text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <p className="text-red-200 text-sm font-semibold uppercase tracking-widest mb-1">Fan Zone</p>
            <h1 className="text-2xl font-black">Rounds</h1>
            <p className="text-red-100 text-sm mt-1">Hey {fanName} 👋</p>
          </div>
          <button onClick={handleLogout} className="mt-1 p-2 rounded-xl text-red-200 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {rounds.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">No rounds yet this season.</p>
        )}

        {live.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Now Playing</h2>
            <div className="space-y-2">{live.map(r => <RoundCard key={r.id} round={r} />)}</div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Upcoming</h2>
            <div className="space-y-2">{upcoming.map(r => <RoundCard key={r.id} round={r} />)}</div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Completed</h2>
            <div className="space-y-2">{completed.map(r => <RoundCard key={r.id} round={r} />)}</div>
          </section>
        )}
      </main>
    </div>
  )
}
