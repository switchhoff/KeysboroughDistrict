'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, collectionGroup, getDocs, doc, getDoc, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth'
import { Round, PendingVote, Team, Player } from '@/lib/types'
import { voteUnlockTime } from '@/lib/voteUnlock'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import VoteTile from '@/components/VoteTile'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, CheckCircle, ChevronRight, ClipboardList, Loader2, MapPin, Trophy, Target, MessageSquare, X, Zap, BarChart2 } from 'lucide-react'

interface SubmittedVote { round: Round; team: Team }

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function deriveReservesKO(seniorsHHMM: string): string {
  const [h, m] = seniorsHHMM.split(':').map(Number)
  const rh = ((h - 2) + 24) % 24
  return `${String(rh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtKO(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  return `KO ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`
}

const rankBg = (i: number) =>
  i === 0 ? 'bg-amber-100 text-amber-600' :
  i === 1 ? 'bg-gray-100 text-gray-600' :
  i === 2 ? 'bg-orange-100 text-orange-600' :
  'bg-gray-50 text-gray-400'

// ─── Shared Stats Panel ───────────────────────────────────────────────────────

type StatFilter = 'all' | 'goals' | 'assists'

interface NoticeMsg { id: string; fanName: string; message: string; timestamp: number; team?: Team }

function StatsPanel({ rounds, players, loading }: {
  rounds: Round[]
  players: Player[]
  loading: boolean
}) {
  const [team, setTeam] = useState<Team>('seniors')
  const [filter, setFilter] = useState<StatFilter>('all')
  const [gameFilter, setGameFilter] = useState<string>('all') // roundId or 'all'

  const roundsWithStats = rounds.filter(r =>
    (r.stats && (r.stats.seniors || r.stats.reserves)) ||
    (r.results && (r.results.seniors || r.results.reserves))
  )
  const filteredRounds = gameFilter === 'all' ? rounds : rounds.filter(r => r.id === gameFilter)

  // Build leaderboard based on current filter
  const board = (() => {
    const totals: Record<string, { goals: number; assists: number }> = {}
    for (const round of filteredRounds) {
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
        total: (totals[p.id]?.goals ?? 0) + (totals[p.id]?.assists ?? 0),
      }))

    if (filter === 'goals')
      return entries.filter(e => e.goals > 0).sort((a, b) => b.goals - a.goals)
    if (filter === 'assists')
      return entries.filter(e => e.assists > 0).sort((a, b) => b.assists - a.assists)
    // 'all' — show anyone with goals or assists, sorted by total contributions
    return entries
      .filter(e => e.goals > 0 || e.assists > 0)
      .sort((a, b) => b.total - a.total || b.goals - a.goals)
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Game filter */}
      {roundsWithStats.length > 0 && (
        <select
          value={gameFilter}
          onChange={e => setGameFilter(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-club-red/30"
        >
          <option value="all">All Games</option>
          {roundsWithStats.sort((a,b) => b.roundNumber - a.roundNumber).map(r => (
            <option key={r.id} value={r.id}>
              R{r.roundNumber} vs {r.opponent}
            </option>
          ))}
        </select>
      )}

      {/* Team filter */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
        {(['seniors', 'reserves'] as Team[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`flex-1 py-2.5 transition-colors ${
              team === t ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {TEAM_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Goals & Assists Leaderboard */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-club-green" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {filter === 'all' ? 'Goals & Assists' : filter === 'goals' ? 'Goals' : 'Assists'} — {TEAM_LABEL[team]}
          </span>
        </div>

        {/* Stat filter */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold mb-3">
          {([
            { id: 'all',     label: 'All Contributions' },
            { id: 'goals',   label: 'Goals Only' },
            { id: 'assists', label: 'Assists Only' },
          ] as { id: StatFilter; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`flex-1 py-2 transition-colors ${
                filter === id ? 'bg-club-green text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
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
            {/* Column headers */}
            <div className={`grid gap-3 px-4 pb-1 ${filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'}`}>
              <div />
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</div>
              {filter !== 'assists' && (
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Goals</div>
              )}
              {filter !== 'goals' && (
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">
                  {filter === 'all' ? 'Asts' : 'Assists'}
                </div>
              )}
              {filter === 'all' && (
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Total</div>
              )}
            </div>

            {board.map((entry, i) => (
              <div
                key={entry.player.id}
                className={`bg-white rounded-2xl border border-gray-100 p-4 grid gap-3 items-center ${
                  filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${rankBg(i)}`}>
                  {i + 1}
                </div>
                <div className="font-bold text-gray-900 truncate">{entry.player.name}</div>
                {filter !== 'assists' && (
                  <div className="text-xl font-black text-club-red text-center">{entry.goals}</div>
                )}
                {filter !== 'goals' && (
                  <div className="text-xl font-black text-club-green text-center">{entry.assists}</div>
                )}
                {filter === 'all' && (
                  <div className="text-xl font-black text-gray-900 text-center">{entry.goals + entry.assists}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Ladder Panel ─────────────────────────────────────────────────────────────

function LadderPanel({ loading }: { loading: boolean }) {
  const [competition, setCompetition] = useState<'seniors' | 'reserves'>('seniors')
  const [matches, setMatches] = useState<import('@/lib/types').LeagueMatch[]>([])
  const [ladderLoading, setLadderLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'leagueMatches'), orderBy('round', 'asc')),
      snap => {
        setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as import('@/lib/types').LeagueMatch)))
        setLadderLoading(false)
      }
    )
    return unsub
  }, [])

  const { computeLadder } = require('@/lib/ladder')
  const ladder: import('@/lib/types').LadderEntry[] = ladderLoading ? [] : computeLadder(matches, competition)

  const formColor = (r: 'W'|'D'|'L') =>
    r === 'W' ? 'bg-green-500' : r === 'D' ? 'bg-amber-400' : 'bg-red-500'

  if (ladderLoading || loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
        {(['seniors', 'reserves'] as const).map(c => (
          <button key={c} onClick={() => setCompetition(c)}
            className={`flex-1 py-2.5 transition-colors ${competition === c ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            {c === 'seniors' ? 'Seniors' : 'Reserves'}
          </button>
        ))}
      </div>

      {ladder.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-8 text-center text-sm text-gray-400">
          No results entered yet for {competition}.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-2 pl-2">#</th>
                <th className="text-left pb-2">Team</th>
                <th className="text-center pb-2 w-7">P</th>
                <th className="text-center pb-2 w-7">W</th>
                <th className="text-center pb-2 w-7">D</th>
                <th className="text-center pb-2 w-7">L</th>
                <th className="text-center pb-2 w-8">GF</th>
                <th className="text-center pb-2 w-8">GA</th>
                <th className="text-center pb-2 w-8">GD</th>
                <th className="text-center pb-2 w-8">Pts</th>
                <th className="text-center pb-2">Form</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((row, i) => (
                <tr key={row.team} className={`border-b border-gray-50 ${row.team === 'Keysborough District FC' || row.team === 'KDFC' ? 'bg-club-red/5' : ''}`}>
                  <td className="py-2.5 pl-2 font-bold text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2.5 font-semibold text-gray-900 text-xs leading-tight pr-2">{row.team}</td>
                  <td className="py-2.5 text-center text-gray-600 text-xs">{row.played}</td>
                  <td className="py-2.5 text-center font-bold text-green-600 text-xs">{row.won}</td>
                  <td className="py-2.5 text-center text-gray-500 text-xs">{row.drawn}</td>
                  <td className="py-2.5 text-center text-red-500 text-xs">{row.lost}</td>
                  <td className="py-2.5 text-center text-gray-600 text-xs">{row.gf}</td>
                  <td className="py-2.5 text-center text-gray-600 text-xs">{row.ga}</td>
                  <td className={`py-2.5 text-center font-semibold text-xs ${row.gd > 0 ? 'text-green-600' : row.gd < 0 ? 'text-red-500' : 'text-gray-500'}`}>{row.gd > 0 ? '+' : ''}{row.gd}</td>
                  <td className="py-2.5 text-center font-black text-gray-900 text-xs">{row.pts}</td>
                  <td className="py-2.5">
                    <div className="flex gap-0.5 justify-center">
                      {row.form.map((r, fi) => (
                        <span key={fi} className={`w-4 h-4 rounded-sm text-white text-[9px] font-black flex items-center justify-center ${formColor(r)} ${fi === row.form.length - 1 ? 'ring-1 ring-offset-[1px] ring-gray-500' : ''}`}>{r}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Fixtures Panel ───────────────────────────────────────────────────────────

function FixturesPanel({ rounds, loading }: { rounds: Round[]; loading: boolean }) {
  const today = new Date(new Date().toDateString())
  const liveRounds     = rounds.filter(r => r.isLive)
  const upcomingRounds = rounds.filter(r => !r.isLive && new Date(r.date) >= today)
  const allFixtures    = [...liveRounds, ...upcomingRounds]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    )
  }

  if (allFixtures.length === 0) {
    return (
      <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
        No upcoming fixtures scheduled.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {allFixtures.map(round => {
        const isLive = round.isLive
        const senKO  = round.seniorsKickOff ?? round.kickOffTime ?? null
        const resKO  = round.reservesKickOff ?? (senKO ? deriveReservesKO(senKO) : null)
        return (
          <div
            key={round.id}
            className={`bg-white border rounded-2xl px-4 py-4 ${
              isLive ? 'border-club-red/30 shadow-sm' : 'border-gray-100'
            }`}
          >
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
                {(resKO || senKO) && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {resKO && <>Reserves {fmtKO(resKO)}</>}
                    {resKO && senKO && ' · '}
                    {senKO && <>Seniors {fmtKO(senKO)}</>}
                  </div>
                )}
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
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Results Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ rounds, loading }: { rounds: Round[]; loading: boolean }) {
  const [team, setTeam] = useState<Team>('seniors')

  // Fan MOTM votes modal
  const [votesModal,    setVotesModal]    = useState<{ roundId: string; opponent: string; team: Team } | null>(null)
  const [votesTally,    setVotesTally]    = useState<{ name: string; count: number }[]>([])
  const [votesLoading,  setVotesLoading]  = useState(false)

  const openVotesModal = async (roundId: string, opponent: string) => {
    setVotesModal({ roundId, opponent, team })
    setVotesTally([])
    setVotesLoading(true)
    const [votesSnap, playersSnap] = await Promise.all([
      getDocs(collection(db, 'rounds', roundId, 'fanVotes')),
      getDocs(collection(db, 'players')),
    ])
    const playerMap: Record<string, string> = {}
    playersSnap.docs.forEach(d => { playerMap[d.id] = (d.data() as Player).name })
    const tally: Record<string, number> = {}
    votesSnap.docs.forEach(d => {
      const data = d.data() as { playerId?: string; team?: string }
      if (data.team !== team) return
      const name = (data.playerId && playerMap[data.playerId]) ?? 'Unknown'
      tally[name] = (tally[name] ?? 0) + 1
    })
    setVotesTally(Object.entries(tally).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setVotesLoading(false)
  }

  // Noticeboard modal
  const [noticeModal,    setNoticeModal]    = useState<{ roundId: string; opponent: string; team: Team } | null>(null)
  const [noticeMessages, setNoticeMessages] = useState<NoticeMsg[]>([])
  const [noticeLoading,  setNoticeLoading]  = useState(false)
  const [noticeCounts,   setNoticeCounts]   = useState<Record<string, number>>({})
  const noticeUnsubRef = useRef<(() => void) | null>(null)

  // Real-time message counts
  useEffect(() => {
    const unsub = onSnapshot(collectionGroup(db, 'chat'), snap => {
      const counts: Record<string, number> = {}
      snap.docs.forEach(d => {
        const data    = d.data() as NoticeMsg
        const roundId = d.ref.parent.parent?.id
        if (!roundId) return
        const teams: Team[] = data.team ? [data.team] : ['seniors', 'reserves']
        teams.forEach(tm => {
          const key = `${roundId}_${tm}`
          counts[key] = (counts[key] ?? 0) + 1
        })
      })
      setNoticeCounts(counts)
    })
    return () => unsub()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeNoticeboard = () => {
    noticeUnsubRef.current?.()
    noticeUnsubRef.current = null
    setNoticeModal(null)
    setNoticeMessages([])
  }

  const openNoticeboard = (roundId: string, opponent: string) => {
    // Clean up any existing listener
    noticeUnsubRef.current?.()
    setNoticeModal({ roundId, opponent, team })
    setNoticeMessages([])
    setNoticeLoading(true)
    const activeTeam = team
    noticeUnsubRef.current = onSnapshot(
      query(collection(db, 'rounds', roundId, 'chat'), orderBy('timestamp', 'asc')),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as NoticeMsg))
        setNoticeMessages(all.filter(m => !m.team || m.team === activeTeam))
        setNoticeLoading(false)
      }
    )
  }

  const completedRounds = rounds.filter(r => r.results?.[team] != null).reverse()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Team filter */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
        {(['seniors', 'reserves'] as Team[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`flex-1 py-2.5 transition-colors ${
              team === t ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {TEAM_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Results list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-club-red" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Results — {TEAM_LABEL[team]}
          </span>
        </div>
        {completedRounds.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
            No results recorded yet for {TEAM_LABEL[team]}.
          </div>
        ) : (
          <div className="space-y-2">
            {completedRounds.map(round => {
              const result   = round.results![team]!
              const won      = result.goalsFor > result.goalsAgainst
              const drew     = result.goalsFor === result.goalsAgainst
              const outcomeBg = won ? 'bg-club-green text-white' : drew ? 'bg-amber-400 text-white' : 'bg-club-red text-white'
              return (
                <div key={round.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">vs {round.opponent}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Round {round.roundNumber} · {formatDate(round.date)}
                    </div>
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
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-lg font-black text-gray-900 leading-none">
                      {result.goalsFor} – {result.goalsAgainst}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${outcomeBg}`}>
                      {won ? 'W' : drew ? 'D' : 'L'}
                    </div>
                    <button
                      onClick={() => openVotesModal(round.id, round.opponent)}
                      className="p-1.5 text-gray-300 hover:text-amber-500 transition-colors"
                    >
                      <Trophy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openNoticeboard(round.id, round.opponent)}
                      className="relative p-1.5 text-gray-300 hover:text-club-red transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {(noticeCounts[`${round.id}_${team}`] ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-club-red text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
                          {noticeCounts[`${round.id}_${team}`]}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fan MOTM votes modal */}
      {votesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setVotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <div className="font-black text-gray-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Fan Player of the Match
                </div>
                <div className="text-xs text-gray-400 mt-0.5">vs {votesModal.opponent} · {TEAM_LABEL[votesModal.team]}</div>
              </div>
              <button onClick={() => setVotesModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {votesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-club-red" /></div>
              ) : votesTally.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No fan votes recorded for this game.</p>
              ) : (
                <div className="space-y-2">
                  {votesTally.map((entry, i) => {
                    const rank = i === 0 ? 1 : votesTally[i].count === votesTally[i - 1].count ? votesTally.findIndex(e => e.count === entry.count) + 1 : i + 1
                    const rankBgV = rank === 1 ? 'bg-amber-400 text-white' : rank === 2 ? 'bg-gray-300 text-white' : rank === 3 ? 'bg-amber-700/60 text-white' : 'bg-gray-100 text-gray-500'
                    return (
                      <div key={entry.name} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${rankBgV}`}>
                          {rank}
                        </div>
                        <div className="flex-1 font-semibold text-gray-900 text-sm">{entry.name}</div>
                        <div className="text-sm font-black text-gray-700">{entry.count} <span className="text-xs font-normal text-gray-400">{entry.count === 1 ? 'vote' : 'votes'}</span></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Noticeboard modal */}
      {noticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeNoticeboard}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <div className="font-black text-gray-900">{TEAM_LABEL[noticeModal.team]} Noticeboard</div>
                <div className="text-xs text-gray-400 mt-0.5">vs {noticeModal.opponent} · Fan Messages</div>
              </div>
              <button onClick={closeNoticeboard} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {noticeLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-club-red" /></div>
              ) : noticeMessages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No messages posted yet.</p>
              ) : noticeMessages.map(m => (
                <div key={m.id} className="bg-gray-50 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-club-red">{m.fanName}</span>
                    <span className="text-[10px] text-gray-400">{new Date(m.timestamp).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                  </div>
                  <p className="text-sm text-gray-700">{m.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const auth = useAuth()

  const isCoach = auth?.role === 'coach'
  const [tab, setTab] = useState<'votes' | 'stats' | 'fixtures' | 'results' | 'ladder'>('votes')

  // Votes state
  const [pending, setPending] = useState<PendingVote[]>([])
  const [submitted, setSubmitted] = useState<SubmittedVote[]>([])
  const [votesLoading, setVotesLoading] = useState(true)

  // Stats state (lazy — listener started on first visit to Stats/Results tab, or immediately for coaches)
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const statsUnsubRef = useRef<(() => void) | null>(null)

  // Live votes listener — re-evaluates pending/submitted whenever rounds collection changes
  useEffect(() => {
    if (!auth || auth.role === 'coach') return
    setVotesLoading(true)
    let cancelled = false
    const unsub = onSnapshot(collection(db, 'rounds'), async snap => {
      if (cancelled) return
      const allRounds = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Round))
        .sort((a, b) => a.roundNumber - b.roundNumber)
      const pendingVotes: PendingVote[] = []
      const submittedVotes: SubmittedVote[] = []
      for (const round of allRounds) {
        for (const team of (['seniors', 'reserves'] as Team[])) {
          if (!round.teamsheets[team].includes(auth.playerId)) continue
          if (new Date() < voteUnlockTime(round, team)) continue
          const voteSnap = await getDoc(doc(db, 'rounds', round.id, 'votes', `${team}_${auth.playerId}`))
          if (cancelled) return
          if (voteSnap.exists()) submittedVotes.push({ round, team })
          else pendingVotes.push({ round, team })
        }
      }
      if (!cancelled) {
        setPending(pendingVotes)
        setSubmitted(submittedVotes)
        setVotesLoading(false)
      }
    })
    return () => { cancelled = true; unsub() }
  }, [auth])

  // Live stats listener — started lazily; players loaded once, rounds stay live
  const startStatsListener = useCallback(() => {
    if (statsUnsubRef.current) return // already listening
    setStatsLoading(true)
    getDocs(collection(db, 'players')).then(snap =>
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)))
    )
    statsUnsubRef.current = onSnapshot(
      query(collection(db, 'rounds'), orderBy('roundNumber', 'asc')),
      snap => {
        setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Round)))
        setStatsLoading(false)
      }
    )
  }, [])

  // Cleanup stats listener on unmount
  useEffect(() => () => { statsUnsubRef.current?.() }, [])

  // On auth ready
  useEffect(() => {
    if (auth === undefined) return
    if (!auth) { router.replace('/login'); return }
    if (isCoach) {
      // Coaches skip votes tab entirely, start stats listener immediately
      setTab('stats')
      startStatsListener()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth])

  // Lazy-start stats listener when player first opens Stats, Fixtures, Results or Ladder tab
  useEffect(() => {
    if ((tab === 'stats' || tab === 'fixtures' || tab === 'results' || tab === 'ladder') && !isCoach) startStatsListener()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  if (!auth) return null

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Tab bar — coaches only see Stats + Results */}
      <div className="bg-white border-b border-gray-100 px-4 sticky top-0 z-10">
        <div className="flex max-w-lg mx-auto w-full">
          {(isCoach
            ? [
                { id: 'stats'    as const, label: 'Stats',    icon: Target        },
                { id: 'fixtures' as const, label: 'Fixtures', icon: Calendar      },
                { id: 'results'  as const, label: 'Results',  icon: ClipboardList },
                { id: 'ladder'   as const, label: 'Ladder',   icon: BarChart2     },
              ]
            : [
                { id: 'votes'    as const, label: 'Votes',    icon: Trophy        },
                { id: 'stats'    as const, label: 'Stats',    icon: Target        },
                { id: 'fixtures' as const, label: 'Fixtures', icon: Calendar      },
                { id: 'results'  as const, label: 'Results',  icon: ClipboardList },
                { id: 'ladder'   as const, label: 'Ladder',   icon: BarChart2     },
              ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === id ? 'border-club-red text-club-red' : 'border-transparent text-gray-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* ── VOTES TAB ── */}
        {tab === 'votes' && !isCoach && (
          votesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-club-red" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Pending */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-club-green" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {pending.length} vote{pending.length !== 1 ? 's' : ''} pending
                  </span>
                </div>
                {pending.length === 0 ? (
                  <div className="flex items-center gap-3 bg-club-red/5 border border-club-red/15 rounded-2xl px-4 py-3.5">
                    <CheckCircle className="w-5 h-5 text-club-red shrink-0" />
                    <p className="text-sm font-medium text-club-red">All caught up — no pending votes.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pending.map(({ round, team }) => (
                      <VoteTile key={`${round.id}_${team}`} round={round} team={team} />
                    ))}
                  </div>
                )}
              </div>

              {/* Submitted */}
              {submitted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-club-red" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {submitted.length} vote{submitted.length !== 1 ? 's' : ''} submitted
                    </span>
                  </div>
                  <div className="space-y-2">
                    {submitted.map(({ round, team }) => (
                      <Link
                        key={`${round.id}_${team}`}
                        href={`/vote?roundId=${round.id}&team=${team}`}
                        className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-club-green/30 hover:shadow-sm transition-all group"
                      >
                        <div>
                          <div className="font-semibold text-gray-700 text-sm">vs {round.opponent}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Round {round.roundNumber} · {formatDate(round.date)} · {TEAM_LABEL[team]}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1 text-club-green">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-semibold">View</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-club-green transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── STATS TAB ── */}
        {tab === 'stats' && (
          <StatsPanel rounds={rounds} players={players} loading={statsLoading} />
        )}

        {/* ── FIXTURES TAB ── */}
        {tab === 'fixtures' && (
          <FixturesPanel rounds={rounds} loading={statsLoading} />
        )}

        {/* ── RESULTS TAB ── */}
        {tab === 'results' && (
          <ResultsPanel rounds={rounds} loading={statsLoading} />
        )}

        {/* ── LADDER TAB ── */}
        {tab === 'ladder' && (
          <LadderPanel loading={statsLoading} />
        )}

      </main>
    </div>
  )
}
