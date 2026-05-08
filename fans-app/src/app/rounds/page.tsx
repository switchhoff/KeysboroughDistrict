'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round, Player, Team } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import FanHeader from '@/components/FanHeader'
import { Loader2, Calendar, ChevronRight, CheckCircle, Zap, MapPin, Target, BarChart2, Bell, BellOff, X } from 'lucide-react'
import { getPushState, subscribeToPush } from '@/lib/pushNotifications'

// ── Kick-off time helpers ─────────────────────────────────────────────────
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  return `KO ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`
}

function deriveReservesKO(seniorsHHMM: string): string {
  const [h, m] = seniorsHHMM.split(':').map(Number)
  const rh = ((h - 2) + 24) % 24
  return `${String(rh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function Countdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState<string>('')

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime()
      const distance = targetDate.getTime() - now

      if (distance < 0) {
        setTimeLeft('')
        clearInterval(timer)
        return
      }

      const d = Math.floor(distance / (1000 * 60 * 60 * 24))
      const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
      const s = Math.floor((distance % (1000 * 60)) / 1000)

      const timeStr = d > 0
        ? `${d}d ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      setTimeLeft(timeStr)
    }, 1000)

    return () => clearInterval(timer)
  }, [targetDate])

  if (!timeLeft) return null

  return (
    <div className="absolute -top-2.5 -left-2 bg-club-red text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-md animate-pulse z-10 border-2 border-white uppercase tracking-wider">
      Seniors starts in {timeLeft}
    </div>
  )
}

type RoundTab = 'upcoming' | 'completed' | 'stats'
type StatFilter = 'all' | 'goals' | 'assists'

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

const rankBg = (i: number) =>
  i === 0 ? 'bg-amber-100 text-amber-600' :
  i === 1 ? 'bg-gray-100 text-gray-600' :
  i === 2 ? 'bg-orange-100 text-orange-600' :
  'bg-gray-50 text-gray-400'

function StatsPanel({ rounds, players, loading }: { rounds: Round[]; players: Player[]; loading: boolean }) {
  const [team, setTeam] = useState<Team>('seniors')
  const [filter, setFilter] = useState<StatFilter>('all')

  const board = (() => {
    const totals: Record<string, { goals: number; assists: number }> = {}
    for (const round of rounds) {
      for (const [playerId, s] of Object.entries(round.stats?.[team] ?? {})) {
        if (!totals[playerId]) totals[playerId] = { goals: 0, assists: 0 }
        totals[playerId].goals += s.goals
        totals[playerId].assists += s.assists
      }
    }
    const entries = players
      .filter(p => p.role !== 'coach')
      .map(p => ({
        player: p,
        goals: totals[p.id]?.goals ?? 0,
        assists: totals[p.id]?.assists ?? 0,
      }))

    if (filter === 'goals')
      return entries.filter(e => e.goals > 0).sort((a, b) => b.goals - a.goals)
    if (filter === 'assists')
      return entries.filter(e => e.assists > 0).sort((a, b) => b.assists - a.assists)
    return entries
      .filter(e => e.goals > 0 || e.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  })()

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
        {(['seniors', 'reserves'] as Team[]).map(t => (
          <button key={t} type="button" onClick={() => setTeam(t)}
            className={`flex-1 py-2.5 transition-colors ${team === t ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            {TEAM_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-club-green" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {filter === 'all' ? 'Goals & Assists' : filter === 'goals' ? 'Goals' : 'Assists'} — {TEAM_LABEL[team]}
          </span>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold mb-3">
          {([
            { id: 'all',     label: 'All Contributions' },
            { id: 'goals',   label: 'Goals Only' },
            { id: 'assists', label: 'Assists Only' },
          ] as { id: StatFilter; label: string }[]).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setFilter(id)}
              className={`flex-1 py-2 transition-colors ${filter === id ? 'bg-club-green text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {board.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
            No {filter === 'assists' ? 'assists' : filter === 'goals' ? 'goals' : 'stats'} recorded yet for {TEAM_LABEL[team]}.
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`grid gap-3 px-4 pb-1 ${filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'}`}>
              <div />
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</div>
              {filter !== 'assists' && <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Goals</div>}
              {filter !== 'goals'   && <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">{filter === 'all' ? 'Asts' : 'Assists'}</div>}
            </div>
            {board.map((entry, i) => (
              <div key={entry.player.id}
                className={`bg-white rounded-2xl border border-gray-100 p-4 grid gap-3 items-center ${filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${rankBg(i)}`}>{i + 1}</div>
                <div className="font-bold text-gray-900 truncate">{entry.player.name}</div>
                {filter !== 'assists' && <div className="text-xl font-black text-club-red text-center">{entry.goals}</div>}
                {filter !== 'goals'   && <div className="text-xl font-black text-club-green text-center">{entry.assists}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FanRoundsPage() {
  const router = useRouter()
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [fanName, setFanName] = useState('')
  const [tab, setTab] = useState<RoundTab>('upcoming')
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [notifLoading,    setNotifLoading]    = useState(false)
  const [fanId,           setFanId]           = useState('')

  useEffect(() => {
    const auth = getStoredFanAuth()
    if (!auth) { router.replace('/'); return }
    setFanName(auth.fanName)
    setFanId(auth.fanId)
    // Show banner if permission not yet decided and not previously dismissed
    const dismissed = localStorage.getItem('kpp_fans_notif_dismissed')
    if (!dismissed && getPushState() === 'default') setShowNotifBanner(true)

    const unsub = onSnapshot(
      query(collection(db, 'rounds'), orderBy('roundNumber', 'desc')),
      snap => {
        setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Round)))
        setLoading(false)
      }
    )
    return () => unsub()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load players when stats tab is first opened
  useEffect(() => {
    if (tab !== 'stats' || players.length > 0) return
    setStatsLoading(true)
    getDocs(collection(db, 'players')).then(snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)))
      setStatsLoading(false)
    })
  }, [tab, players.length])

  const liveRounds      = rounds.filter(r => r.isLive)
  const upcomingRounds  = rounds.filter(r => !r.isLive && new Date(r.date) >= new Date(new Date().toDateString())).reverse()
  const completedRounds = rounds.filter(r => !r.isLive && new Date(r.date) < new Date(new Date().toDateString()))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  const RoundCard = ({ round, isLive, showCountdown }: { round: Round; isLive?: boolean; showCountdown?: boolean }) => {
    const senKO = round.seniorsKickOff ?? round.kickOffTime
    const kickoffDate = (showCountdown && senKO) ? new Date(`${round.date}T${senKO}`) : null

    return (
      <Link href={`/round?roundId=${round.id}`} className="relative block group">
        {kickoffDate && <Countdown targetDate={kickoffDate} />}
        <div className={`bg-white border rounded-2xl px-4 py-4 hover:shadow-sm transition-all ${
          isLive ? 'border-club-red/30 shadow-sm' : 'border-gray-100 hover:border-club-red/30'
        }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isLive ? (
              <div className="w-10 h-10 rounded-xl bg-club-red/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-club-red" />
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
                Round {round.roundNumber} · {formatDate(round.date)}
              </div>
              {(() => {
                const senKO = round.seniorsKickOff ?? round.kickOffTime
                const resKO = round.reservesKickOff ?? (senKO ? deriveReservesKO(senKO) : null)
                return (senKO || resKO) ? (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {resKO && <>Reserves {fmtTime(resKO)}</>}
                    {resKO && senKO && ' · '}
                    {senKO && <>Seniors {fmtTime(senKO)}</>}
                  </div>
                ) : null
              })()}
              {(round.location || round.venue) && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  {round.venue && (
                    <span className={`font-semibold mr-0.5 ${round.venue === 'home' ? 'text-club-red' : 'text-gray-500'}`}>
                      {round.venue === 'home' ? 'Home' : 'Away'}
                    </span>
                  )}
                  {round.location && (
                    <><MapPin className="w-3 h-3 shrink-0" />{round.location}</>
                  )}
                </div>
              )}
              {!isLive && round.results && (
                <div className="flex gap-2 mt-1.5">
                  {round.results.seniors && (() => {
                    const { goalsFor: f, goalsAgainst: a } = round.results.seniors
                    const cls = f > a ? 'bg-green-500 text-white' : f === a ? 'bg-amber-400 text-white' : 'bg-club-red text-white'
                    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>Seniors {f}–{a}</span>
                  })()}
                  {round.results.reserves && (() => {
                    const { goalsFor: f, goalsAgainst: a } = round.results.reserves
                    const cls = f > a ? 'bg-green-500 text-white' : f === a ? 'bg-amber-400 text-white' : 'bg-club-red text-white'
                    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>Reserves {f}–{a}</span>
                  })()}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-club-red transition-colors shrink-0" />
        </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <FanHeader fanName={fanName} />

      {/* Goal notification banner */}
      {showNotifBanner && (
        <div className="bg-club-red/5 border-b border-club-red/10 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-club-red" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">Get goal alerts</p>
              <p className="text-xs text-gray-500">We'll notify you the moment KDFC score</p>
            </div>
            <button
              onClick={async () => {
                setNotifLoading(true)
                const ok = await subscribeToPush(fanId)
                setNotifLoading(false)
                if (ok || getPushState() !== 'default') {
                  setShowNotifBanner(false)
                  localStorage.setItem('kpp_fans_notif_dismissed', '1')
                }
              }}
              disabled={notifLoading}
              className="shrink-0 flex items-center gap-1.5 bg-club-red text-white text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-50 transition-opacity"
            >
              {notifLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Enable'}
            </button>
            <button
              onClick={() => { setShowNotifBanner(false); localStorage.setItem('kpp_fans_notif_dismissed', '1') }}
              className="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
        <div className="sticky top-0 bg-white border-b border-gray-100 z-10">
          <div className="flex max-w-lg mx-auto">
            {([
              { id: 'upcoming'  as RoundTab, label: `Fixtures${upcomingRounds.length   ? ` (${upcomingRounds.length})`   : ''}`, icon: Calendar      },
              { id: 'completed' as RoundTab, label: `Results${completedRounds.length ? ` (${completedRounds.length})` : ''}`, icon: CheckCircle },
              { id: 'stats'     as RoundTab, label: 'Stats',                                                                     icon: BarChart2     },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
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
              ? <p className="text-center text-gray-400 text-sm py-10">No fixtures scheduled.</p>
              : upcomingRounds.map((r, i) => <RoundCard key={r.id} round={r} showCountdown={i === 0} />)
          )}
          {tab === 'completed' && (
            completedRounds.length === 0
              ? <p className="text-center text-gray-400 text-sm py-10">No results yet.</p>
              : completedRounds.map(r => <RoundCard key={r.id} round={r} />)
          )}
          {tab === 'stats' && (
            <StatsPanel rounds={rounds} players={players} loading={statsLoading} />
          )}
        </div>
      </main>
    </div>
  )
}
