'use client'

import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth'
import { Round, PendingVote, Team, Player } from '@/lib/types'
import { voteUnlockTime } from '@/lib/voteUnlock'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import VoteTile from '@/components/VoteTile'
import Link from 'next/link'
import { CheckCircle, ChevronRight, Loader2, Trophy, Target } from 'lucide-react'

interface SubmittedVote { round: Round; team: Team }

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

const rankBg = (i: number) =>
  i === 0 ? 'bg-amber-100 text-amber-600' :
  i === 1 ? 'bg-gray-100 text-gray-600' :
  i === 2 ? 'bg-orange-100 text-orange-600' :
  'bg-gray-50 text-gray-400'

// ─── Shared Stats Panel ───────────────────────────────────────────────────────

type StatFilter = 'all' | 'goals' | 'assists'

function StatsPanel({ rounds, players, loading }: {
  rounds: Round[]
  players: Player[]
  loading: boolean
}) {
  const [team, setTeam] = useState<Team>('seniors')
  const [filter, setFilter] = useState<StatFilter>('all')

  // Build leaderboard based on current filter
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
        total: (totals[p.id]?.goals ?? 0) + (totals[p.id]?.assists ?? 0),
      }))

    if (filter === 'goals')
      return entries.filter(e => e.goals > 0).sort((a, b) => b.goals - a.goals)
    if (filter === 'assists')
      return entries.filter(e => e.assists > 0).sort((a, b) => b.assists - a.assists)
    // 'all' — show anyone with goals or assists, sorted by goals then assists
    return entries
      .filter(e => e.goals > 0 || e.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  })()

  const completedRounds = rounds.filter(r => r.results?.[team] != null).reverse()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

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
            <div className={`grid gap-3 px-4 pb-1 ${filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'}`}>
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
            </div>

            {board.map((entry, i) => (
              <div
                key={entry.player.id}
                className={`bg-white rounded-2xl border border-gray-100 p-4 grid gap-3 items-center ${
                  filter === 'all' ? 'grid-cols-[2.25rem_1fr_3.5rem_3.5rem]' : 'grid-cols-[2.25rem_1fr_3.5rem]'
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-club-red" />
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
              const result = round.results![team]!
              const won = result.goalsFor > result.goalsAgainst
              const drew = result.goalsFor === result.goalsAgainst
              const outcomeBg = won ? 'bg-club-green text-white' : drew ? 'bg-amber-400 text-white' : 'bg-club-red text-white'
              return (
                <div
                  key={round.id}
                  className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">vs {round.opponent}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(round.date)} · Rd {round.roundNumber} · {round.venue === 'home' ? 'Home' : 'Away'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-lg font-black text-gray-900 leading-none">
                      {result.goalsFor} – {result.goalsAgainst}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${outcomeBg}`}>
                      {won ? 'W' : drew ? 'D' : 'L'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const auth = useAuth()

  const isCoach = auth?.role === 'coach'
  const [tab, setTab] = useState<'votes' | 'stats'>('votes')

  // Votes state
  const [pending, setPending] = useState<PendingVote[]>([])
  const [submitted, setSubmitted] = useState<SubmittedVote[]>([])
  const [votesLoading, setVotesLoading] = useState(true)

  // Stats state (lazy — loaded on first visit to Stats tab, or immediately for coaches)
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(false)

  const loadVotes = useCallback(async () => {
    if (!auth || auth.role === 'coach') return
    setVotesLoading(true)
    try {
      const roundsSnap = await getDocs(collection(db, 'rounds'))
      const allRounds = roundsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Round))
        .sort((a, b) => a.roundNumber - b.roundNumber)
      const pendingVotes: PendingVote[] = []
      const submittedVotes: SubmittedVote[] = []
      for (const round of allRounds) {
        for (const team of (['seniors', 'reserves'] as Team[])) {
          if (!round.teamsheets[team].includes(auth.playerId)) continue
          if (new Date() < voteUnlockTime(round, team)) continue
          const voteSnap = await getDoc(doc(db, 'rounds', round.id, 'votes', `${team}_${auth.playerId}`))
          if (voteSnap.exists()) submittedVotes.push({ round, team })
          else pendingVotes.push({ round, team })
        }
      }
      setPending(pendingVotes)
      setSubmitted(submittedVotes)
    } finally {
      setVotesLoading(false)
    }
  }, [auth])

  const loadStats = useCallback(async () => {
    if (statsLoaded) return
    setStatsLoading(true)
    try {
      const [roundsSnap, playersSnap] = await Promise.all([
        getDocs(collection(db, 'rounds')),
        getDocs(collection(db, 'players')),
      ])
      setRounds(
        roundsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Round))
          .sort((a, b) => a.roundNumber - b.roundNumber)
      )
      setPlayers(playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player)))
      setStatsLoaded(true)
    } finally {
      setStatsLoading(false)
    }
  }, [statsLoaded])

  // On auth ready
  useEffect(() => {
    if (auth === undefined) return
    if (!auth) { router.replace('/login'); return }
    if (isCoach) {
      // Coaches skip votes tab entirely, load stats immediately
      setTab('stats')
      loadStats()
    } else {
      loadVotes()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth])

  // Lazy-load stats when player first opens Stats tab
  useEffect(() => {
    if (tab === 'stats' && !isCoach) loadStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  if (!auth) return null

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Tab bar — coaches only see Stats */}
      {!isCoach && (
        <div className="bg-white border-b border-gray-100 px-4 sticky top-0 z-10">
          <div className="flex max-w-lg mx-auto w-full">
            {([
              { id: 'votes', label: 'Votes', icon: Trophy },
              { id: 'stats', label: 'Stats',  icon: Target },
            ] as { id: 'votes' | 'stats'; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
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
      )}

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* Greeting */}
        <div className="mb-5">
          <h2 className="text-2xl font-black text-gray-900">{auth.name}</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {isCoach ? 'Season overview' : tab === 'votes' ? 'Your pending votes are below' : 'Season stats & results'}
          </p>
        </div>

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
                            {formatDate(round.date)} · Rd {round.roundNumber} · {TEAM_LABEL[team]}
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

      </main>
    </div>
  )
}
