'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import FanHeader from '@/components/FanHeader'
import { Loader2, Calendar, ChevronRight, CheckCircle, Zap } from 'lucide-react'

// ── Kick-off time helpers ─────────────────────────────────────────────────
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

function reservesTime(seniorsHHMM: string): string {
  const [h, m] = seniorsHHMM.split(':').map(Number)
  let rh = h - 2; if (rh < 0) rh += 24
  return `${rh.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

type RoundTab = 'upcoming' | 'completed'

export default function FanRoundsPage() {
  const router = useRouter()
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [fanName, setFanName] = useState('')
  const [tab, setTab] = useState<RoundTab>('upcoming')

  useEffect(() => {
    const auth = getStoredFanAuth()
    if (!auth) { router.replace('/'); return }
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

  const liveRounds      = rounds.filter(r => r.isLive)
  const upcomingRounds  = rounds.filter(r => !r.isLive && new Date(r.date) >= new Date(new Date().toDateString())).reverse()
  const completedRounds = rounds.filter(r => !r.isLive && new Date(r.date) < new Date(new Date().toDateString()))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  const RoundCard = ({ round, isLive }: { round: Round; isLive?: boolean }) => (
    <Link href={`/round?roundId=${round.id}`}>
      <div className={`bg-white border rounded-2xl px-4 py-4 hover:shadow-sm transition-all group ${
        isLive ? 'border-club-red/30 shadow-sm' : 'border-gray-100 hover:border-club-red/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isLive ? (
              <div className="w-10 h-10 rounded-xl bg-club-red/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-club-red" />
              </div>
            ) : new Date(round.date) < new Date(new Date().toDateString()) ? (
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-gray-400" />
              </div>
            ) : (
              <Image src="/logo.png" alt="KDFC" width={40} height={40} className="rounded-full shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <div className="font-bold text-gray-900">vs {round.opponent}</div>
                {isLive && (
                  <span className="text-[10px] font-bold text-club-red bg-club-red/10 px-2 py-0.5 rounded-full uppercase tracking-wide animate-pulse">
                    Live
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDate(round.date)} · Rd {round.roundNumber}
              </div>
              {round.kickOffTime && (
                <div className="text-xs text-gray-400 mt-0.5">
                  Res {fmtTime(reservesTime(round.kickOffTime))} · Snr {fmtTime(round.kickOffTime)}
                </div>
              )}
              {!isLive && round.results && (
                <div className="flex gap-2 mt-1.5">
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
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-club-red transition-colors shrink-0" />
        </div>
      </div>
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <FanHeader fanName={fanName} />

      <main className="flex-1 max-w-lg mx-auto w-full">

        {/* ── Current / Live rounds ── */}
        {liveRounds.length > 0 && (
          <div className="px-4 pt-5 pb-2">
            <h2 className="text-xs font-bold text-club-red uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Happening Now
            </h2>
            <div className="space-y-2">
              {liveRounds.map(r => <RoundCard key={r.id} round={r} isLive />)}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-2 z-10">
          <div className="flex max-w-lg mx-auto">
            {([
              { id: 'upcoming'  as RoundTab, label: `Upcoming${upcomingRounds.length   ? ` (${upcomingRounds.length})`   : ''}`, icon: Calendar      },
              { id: 'completed' as RoundTab, label: `Completed${completedRounds.length ? ` (${completedRounds.length})` : ''}`, icon: CheckCircle },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tab === id ? 'border-club-red text-club-red' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="px-4 pt-4 pb-4 space-y-2">
          {tab === 'upcoming' && (
            upcomingRounds.length === 0
              ? <p className="text-center text-gray-400 text-sm py-10">No upcoming rounds.</p>
              : upcomingRounds.map(r => <RoundCard key={r.id} round={r} />)
          )}
          {tab === 'completed' && (
            completedRounds.length === 0
              ? <p className="text-center text-gray-400 text-sm py-10">No completed rounds yet.</p>
              : completedRounds.map(r => <RoundCard key={r.id} round={r} />)
          )}
        </div>
      </main>
    </div>
  )
}
