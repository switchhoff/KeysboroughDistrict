'use client'

import { useEffect, useState } from 'react'
import { collection, collectionGroup, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, addDoc } from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '@/lib/auth'
import { Player, Round, Vote, Team, PlayerStat, SupportRequest, SupportMessage, LeagueMatch, LadderEntry } from '@/lib/types'
import { computeLadder } from '@/lib/ladder'
import { voteUnlockTime } from '@/lib/voteUnlock'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { ChevronDown, Loader2, Plus, Calendar, Users, Trophy, AlertTriangle, UserPlus, Trash2, Target, Pencil, Check, X, Zap, MessageSquare, MapPin, QrCode, ExternalLink, BarChart2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

type Tab = 'leaderboard' | 'shame' | 'teamsheet' | 'players' | 'setup' | 'stats' | 'support' | 'fanzone' | 'ladder'

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

/** Derive reserves KO from seniors KO string (HH:MM) — seniors minus 2 hours */
function deriveReservesKO(seniorsHHMM: string): string {
  const [h, m] = seniorsHHMM.split(':').map(Number)
  const rh = ((h - 2) + 24) % 24
  return `${String(rh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface LeaderboardEntry {
  player: Player
  total: number
  threes: number
  twos: number
  ones: number
}

// ── Admin Ladder Tab ──────────────────────────────────────────────────────────
function AdminLadderTab() {
  const [matches,     setMatches]     = useState<LeagueMatch[]>([])
  const [loading,     setLoading]     = useState(true)
  const [competition, setCompetition] = useState<'seniors' | 'reserves'>('seniors')

  // Team roster state
  const [teams,       setTeams]       = useState<string[]>([])
  const [newTeam,     setNewTeam]     = useState('')
  const [addingTeam,  setAddingTeam]  = useState(false)

  // Round filter for results log
  const [roundFilter, setRoundFilter] = useState<string>('all')

  // Add-result form
  const [fRound,      setFRound]      = useState('')
  const [fDate,       setFDate]       = useState('')
  const [fHome,       setFHome]       = useState('')
  const [fHomeScore,  setFHomeScore]  = useState('')
  const [fAway,       setFAway]       = useState('')
  const [fAwayScore,  setFAwayScore]  = useState('')
  const [saving,      setSaving]      = useState(false)

  // Load matches
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'leagueMatches'), orderBy('round', 'asc')),
      snap => {
        setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeagueMatch)))
        setLoading(false)
      }
    )
    return unsub
  }, [])

  // Load team roster from Firestore (single doc for simplicity)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'ladderConfig', 'teams'), snap => {
      if (snap.exists()) setTeams((snap.data().list as string[]) ?? [])
    })
    return unsub
  }, [])

  const saveTeams = (updated: string[]) =>
    setDoc(doc(db, 'ladderConfig', 'teams'), { list: updated })

  const addTeam = async () => {
    const name = newTeam.trim()
    if (!name || teams.includes(name)) return
    setAddingTeam(true)
    const updated = [...teams, name].sort()
    await saveTeams(updated)
    setTeams(updated)
    setNewTeam('')
    setAddingTeam(false)
  }

  const removeTeam = (name: string) => {
    const updated = teams.filter(t => t !== name)
    saveTeams(updated)
    setTeams(updated)
  }

  const addMatch = async () => {
    if (!fRound || !fHome || !fAway || fHomeScore === '' || fAwayScore === '') return
    setSaving(true)
    try {
      await addDoc(collection(db, 'leagueMatches'), {
        round: parseInt(fRound), date: fDate || '',
        homeTeam: fHome, awayTeam: fAway,
        homeScore: parseInt(fHomeScore), awayScore: parseInt(fAwayScore),
        competition,
      })
      setFHomeScore(''); setFAwayScore(''); setFHome(''); setFAway('')
      // keep round + date so admin can quickly add next game in same round
    } finally { setSaving(false) }
  }

  const ladder: LadderEntry[] = loading ? [] : computeLadder(matches, competition)
  const formColor = (r: 'W'|'D'|'L') =>
    r === 'W' ? 'bg-green-500' : r === 'D' ? 'bg-amber-400' : 'bg-red-500'

  const competitionMatches = matches
    .filter(m => m.competition === competition)
    .sort((a, b) => b.round - a.round)

  const rounds = Array.from(new Set(competitionMatches.map(m => m.round))).sort((a,b) => b - a)

  const visibleMatches = roundFilter === 'all'
    ? competitionMatches
    : competitionMatches.filter(m => m.round === parseInt(roundFilter))

  const selectCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-club-red/30'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-black text-gray-900 text-base">Ladder</h2>
        <p className="text-sm text-gray-400 mt-0.5">Manage teams, enter results, and track the season ladder.</p>
      </div>

      {/* Competition toggle */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
        {(['seniors', 'reserves'] as const).map(c => (
          <button key={c} onClick={() => setCompetition(c)}
            className={`flex-1 py-2.5 transition-colors ${competition === c ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            {c === 'seniors' ? 'Seniors' : 'Reserves'}
          </button>
        ))}
      </div>

      {/* ── Team Roster ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
        <div className="font-semibold text-gray-900 text-sm">League Teams</div>
        {teams.length === 0
          ? <p className="text-xs text-gray-400">No teams yet — add all clubs in the competition.</p>
          : (
            <div className="flex flex-wrap gap-2">
              {teams.map(t => (
                <span key={t} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {t}
                  <button onClick={() => removeTeam(t)} className="text-gray-400 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )
        }
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder="Add team name…"
            value={newTeam}
            onChange={e => setNewTeam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTeam()}
          />
          <button onClick={addTeam} disabled={addingTeam || !newTeam.trim()}
            className="bg-club-red text-white font-bold px-4 rounded-xl hover:bg-club-red/90 disabled:opacity-40 transition-colors flex items-center gap-1">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Add Result Form ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
        <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-club-red" /> Add Result
        </div>

        {/* Round + Date */}
        <div className="grid grid-cols-2 gap-2">
          <input className="input-field" placeholder="Round #" type="number" value={fRound} onChange={e => setFRound(e.target.value)} />
          <input className="input-field" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
        </div>

        {/* Home team + score */}
        <div className="grid grid-cols-[1fr_3rem] gap-2 items-center">
          <select className={selectCls} value={fHome} onChange={e => setFHome(e.target.value)}>
            <option value="">Home Team…</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input-field text-center px-1 font-bold" placeholder="0" type="number" min="0" value={fHomeScore} onChange={e => setFHomeScore(e.target.value)} />
        </div>

        {/* Away team + score */}
        <div className="grid grid-cols-[1fr_3rem] gap-2 items-center">
          <select className={selectCls} value={fAway} onChange={e => setFAway(e.target.value)}>
            <option value="">Away Team…</option>
            {teams.filter(t => t !== fHome).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input-field text-center px-1 font-bold" placeholder="0" type="number" min="0" value={fAwayScore} onChange={e => setFAwayScore(e.target.value)} />
        </div>

        <button onClick={addMatch} disabled={saving || !fRound || !fHome || !fAway || fHomeScore === '' || fAwayScore === ''}
          className="w-full bg-club-red text-white font-bold py-2.5 rounded-xl hover:bg-club-red/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Result
        </button>
      </div>

      {/* ── Live Ladder ── */}
      {!loading && ladder.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Current Ladder</p>
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
                    <td className="py-2 pl-2 text-gray-400 text-xs font-bold">{i + 1}</td>
                    <td className="py-2 font-semibold text-gray-900 text-xs pr-2">{row.team}</td>
                    <td className="py-2 text-center text-gray-600 text-xs">{row.played}</td>
                    <td className="py-2 text-center font-bold text-green-600 text-xs">{row.won}</td>
                    <td className="py-2 text-center text-gray-500 text-xs">{row.drawn}</td>
                    <td className="py-2 text-center text-red-500 text-xs">{row.lost}</td>
                    <td className="py-2 text-center text-gray-600 text-xs">{row.gf}</td>
                    <td className="py-2 text-center text-gray-600 text-xs">{row.ga}</td>
                    <td className={`py-2 text-center font-semibold text-xs ${row.gd > 0 ? 'text-green-600' : row.gd < 0 ? 'text-red-500' : 'text-gray-500'}`}>{row.gd > 0 ? '+' : ''}{row.gd}</td>
                    <td className="py-2 text-center font-black text-gray-900 text-xs">{row.pts}</td>
                    <td className="py-2">
                      <div className="flex gap-0.5 justify-center">
                        {row.form.map((r, fi) => (
                          <span key={fi} className={`w-4 h-4 rounded-sm text-white text-[9px] font-black flex items-center justify-center ${formColor(r)}`}>{r}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Results Log ── */}
      {competitionMatches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Results</p>
            <select
              value={roundFilter}
              onChange={e => setRoundFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 bg-white focus:outline-none"
            >
              <option value="all">All Rounds</option>
              {rounds.map(r => <option key={r} value={r}>Round {r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            {visibleMatches.map(m => (
              <div key={m.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="text-xs text-gray-400 shrink-0">R{m.round}{m.date && ` · ${m.date}`}</div>
                <div className="text-sm font-semibold text-gray-900 text-center flex-1">
                  {m.homeTeam} <span className="font-black text-club-red">{m.homeScore}–{m.awayScore}</span> {m.awayTeam}
                </div>
                <button onClick={() => deleteDoc(doc(db, 'leagueMatches', m.id))} className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Add Round state
  const [newOpponent, setNewOpponent] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newKickOffTime, setNewKickOffTime] = useState('19:00')
  const [newReservesKickOff, setNewReservesKickOff] = useState('17:00')
  const [newVenue, setNewVenue] = useState<'home' | 'away'>('home')
  const [newLocation, setNewLocation] = useState('Parkmore Soccer Club')
  const [addingRound, setAddingRound] = useState(false)

  // Edit Round state
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null)
  const [editOpponent, setEditOpponent] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editKickOffTime, setEditKickOffTime] = useState('19:00')
  const [editReservesKickOff, setEditReservesKickOff] = useState('17:00')
  const [editVenue, setEditVenue] = useState<'home' | 'away'>('home')
  const [editLocation, setEditLocation] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Shame list filters
  const [shameRoundFilter, setShameRoundFilter] = useState<string>('all')
  const [shameTeamFilter, setShameTeamFilter] = useState<'all' | 'reserves' | 'seniors'>('all')

  // Stats state
  const [statsRound, setStatsRound] = useState<Round | null>(null)
  const [statsResults, setStatsResults] = useState<Record<Team, { goalsFor: string; goalsAgainst: string }>>({
    reserves: { goalsFor: '', goalsAgainst: '' },
    seniors: { goalsFor: '', goalsAgainst: '' },
  })
  const [statsPlayerStats, setStatsPlayerStats] = useState<Record<Team, Record<string, { goals: string; assists: string }>>>({
    reserves: {},
    seniors: {},
  })
  const [savingStats, setSavingStats] = useState(false)

  // Noticeboard modal state
  interface NoticeMsg { id: string; fanName: string; message: string; timestamp: number }
  const [noticeModal, setNoticeModal]       = useState<{ roundId: string; team: Team; label: string } | null>(null)
  const [noticeMessages, setNoticeMessages] = useState<NoticeMsg[]>([])
  const [noticeLoading, setNoticeLoading]   = useState(false)

  const openNoticeboard = async (roundId: string, team: Team, label: string) => {
    setNoticeModal({ roundId, team, label })
    setNoticeMessages([])
    setNoticeLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'rounds', roundId, 'chat'), orderBy('timestamp', 'asc')))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as NoticeMsg & { team?: Team }))
      setNoticeMessages(all.filter(m => !m.team || m.team === team))
    } finally { setNoticeLoading(false) }
  }

  // Support state
  const [supportRequests,  setSupportRequests]  = useState<SupportRequest[]>([])
  const [activeSupportId,  setActiveSupportId]  = useState<string | null>(null)
  const [supportMessages,  setSupportMessages]  = useState<SupportMessage[]>([])
  const [adminReply,       setAdminReply]       = useState('')
  const [sendingReply,     setSendingReply]     = useState(false)

  // Derive active chat from live list — status / subject updates instantly without re-opening
  const supportChat = activeSupportId
    ? (supportRequests.find(r => r.id === activeSupportId) ?? null)
    : null

  // Load support requests live (always on, not just when tab === 'support', so badge updates)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'support'), orderBy('lastMessageAt', 'desc')),
      snap => setSupportRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportRequest)))
    )
    return () => unsub()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load messages for active support chat
  useEffect(() => {
    if (!activeSupportId) return
    const unsub = onSnapshot(
      query(collection(db, 'support', activeSupportId, 'messages'), orderBy('timestamp', 'asc')),
      snap => setSupportMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage)))
    )
    return () => unsub()
  }, [activeSupportId])

  const openSupportChat = async (r: SupportRequest) => {
    setActiveSupportId(r.id)
    // Mark as read — clears the unread dot for this request
    if (r.lastSenderRole === 'user') {
      await updateDoc(doc(db, 'support', r.id), { lastSenderRole: 'read' })
    }
  }

  const handleAdminReply = async () => {
    if (!supportChat || !adminReply.trim() || sendingReply) return
    setSendingReply(true)
    const text = adminReply.trim(); setAdminReply('')
    try {
      const now = Date.now()
      await addDoc(collection(db, 'support', supportChat.id, 'messages'), {
        text, sender: 'admin', senderName: 'Admin', timestamp: now,
      })
      await updateDoc(doc(db, 'support', supportChat.id), {
        lastMessage: text, lastMessageAt: now, lastSenderRole: 'admin',
      })
    } finally { setSendingReply(false) }
  }

  const handleResolveRequest = async (requestId: string, current: 'open' | 'resolved') => {
    await updateDoc(doc(db, 'support', requestId), { status: current === 'open' ? 'resolved' : 'open' })
  }

  // Players state
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerRole, setNewPlayerRole] = useState<'player' | 'admin' | 'coach'>('player')
  const [addingPlayer, setAddingPlayer] = useState(false)

  // Teamsheet state
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [reservesSelected, setReservesSelected] = useState<string[]>([])
  const [seniorsSelected, setSeniorsSelected] = useState<string[]>([])
  const [playerNumbers, setPlayerNumbers] = useState<Record<Team, Record<string, string>>>({ seniors: {}, reserves: {} })
  const [savingTeamsheet, setSavingTeamsheet] = useState(false)
  const [teamsheetSaved, setTeamsheetSaved] = useState(false)
  const [notifyingTeam, setNotifyingTeam] = useState<Team | null>(null)
  const [notifyResult, setNotifyResult] = useState<Partial<Record<Team, number>>>({})
  const [teamFilter, setTeamFilter] = useState<Record<Team, 'all' | 'added' | 'unadded'>>({
    reserves: 'all',
    seniors: 'all',
  })

  useEffect(() => {
    if (auth === undefined) return
    if (!auth || auth.role !== 'admin') { router.replace('/'); return }
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [playersSnap, roundsSnap, votesSnap] = await Promise.allSettled([
        getDocs(collection(db, 'players')),
        getDocs(query(collection(db, 'rounds'), orderBy('roundNumber'))),
        getDocs(collectionGroup(db, 'votes')),
      ])
      if (playersSnap.status === 'fulfilled')
        setPlayers(playersSnap.value.docs.map(d => ({ id: d.id, ...d.data() } as Player)))
      if (roundsSnap.status === 'fulfilled')
        setRounds(roundsSnap.value.docs.map(d => ({ id: d.id, ...d.data() } as Round)))
      if (votesSnap.status === 'fulfilled')
        setVotes(votesSnap.value.docs.map(d => ({ id: d.id, ...d.data() } as Vote)))
    } finally {
      setLoading(false)
    }
  }

  // --- Add Round ---
  const handleAddRound = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOpponent.trim() || !newDate) return
    setAddingRound(true)
    try {
      const nextNumber = rounds.length > 0 ? Math.max(...rounds.map(r => r.roundNumber)) + 1 : 1
      const roundId = `round_${String(nextNumber).padStart(2, '0')}_${Date.now()}`
      const round: Round = {
        id: roundId,
        roundNumber: nextNumber,
        date: newDate,
        kickOffTime: newKickOffTime,
        seniorsKickOff: newKickOffTime,
        reservesKickOff: newReservesKickOff,
        ...(newLocation.trim() ? { location: newLocation.trim() } : {}),
        opponent: newOpponent.trim(),
        venue: newVenue,
        teamsheets: { reserves: [], seniors: [] },
      }
      await setDoc(doc(db, 'rounds', roundId), round)
      setToast({ message: `Round ${nextNumber} vs ${round.opponent} added!`, type: 'success' })
      setNewOpponent('')
      setNewDate('')
      setNewKickOffTime('19:00')
      setNewReservesKickOff('17:00')
      setNewVenue('home')
      setNewLocation('Parkmore Soccer Club')
      await loadAll()
    } catch {
      setToast({ message: 'Failed to add round.', type: 'error' })
    } finally {
      setAddingRound(false)
    }
  }

  const handleDeleteRound = async (round: Round) => {
    if (!confirm(`Delete Round ${round.roundNumber} vs ${round.opponent}?`)) return
    try {
      await deleteDoc(doc(db, 'rounds', round.id))
      setToast({ message: 'Round deleted.', type: 'success' })
      if (selectedRound?.id === round.id) setSelectedRound(null)
      await loadAll()
    } catch {
      setToast({ message: 'Failed to delete round.', type: 'error' })
    }
  }

  const startEditRound = (round: Round) => {
    setEditingRoundId(round.id)
    setEditOpponent(round.opponent)
    setEditDate(round.date)
    setEditKickOffTime(round.seniorsKickOff ?? round.kickOffTime ?? '19:00')
    setEditReservesKickOff(round.reservesKickOff ?? deriveReservesKO(round.seniorsKickOff ?? round.kickOffTime ?? '19:00'))
    setEditVenue(round.venue)
    setEditLocation(round.location ?? (round.venue === 'home' ? 'Parkmore Soccer Club' : ''))
  }

  const handleToggleLive = async (round: Round) => {
    try {
      const next = !round.isLive
      await updateDoc(doc(db, 'rounds', round.id), { isLive: next })
      setRounds(prev => prev.map(r => r.id === round.id ? { ...r, isLive: next } : r))
      setToast({ message: `Round ${round.roundNumber} marked as ${next ? 'Live ⚡' : 'not live'}.`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to update live status.', type: 'error' })
    }
  }

  const handleSaveRoundEdit = async () => {
    if (!editingRoundId || !editOpponent.trim() || !editDate) return
    setSavingEdit(true)
    try {
      await updateDoc(doc(db, 'rounds', editingRoundId), {
        opponent: editOpponent.trim(),
        date: editDate,
        kickOffTime: editKickOffTime,
        seniorsKickOff: editKickOffTime,
        reservesKickOff: editReservesKickOff,
        location: editLocation.trim() || null,
        venue: editVenue,
      })
      setToast({ message: 'Round updated.', type: 'success' })
      setEditingRoundId(null)
      await loadAll()
    } catch {
      setToast({ message: 'Failed to update round.', type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  // --- Teamsheet ---
  const handleSelectRound = (round: Round) => {
    setSelectedRound(round)
    setReservesSelected(round.teamsheets.reserves)
    setSeniorsSelected(round.teamsheets.seniors)
    setPlayerNumbers({
      seniors:  round.numbers?.seniors  ?? {},
      reserves: round.numbers?.reserves ?? {},
    })
    setTeamsheetSaved(false)
    setNotifyResult({})
  }

  const togglePlayer = (playerId: string, team: Team) => {
    if (team === 'reserves') {
      setReservesSelected(prev =>
        prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
      )
    } else {
      setSeniorsSelected(prev =>
        prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
      )
    }
  }

  const handleSaveTeamsheet = async () => {
    if (!selectedRound) return
    setSavingTeamsheet(true)
    try {
      await updateDoc(doc(db, 'rounds', selectedRound.id), {
        'teamsheets.reserves': reservesSelected,
        'teamsheets.seniors':  seniorsSelected,
        'numbers.reserves':    playerNumbers.reserves,
        'numbers.seniors':     playerNumbers.seniors,
      })
      setToast({ message: 'Teamsheet saved!', type: 'success' })
      setTeamsheetSaved(true)
      setNotifyResult({})
      await loadAll()
    } catch {
      setToast({ message: 'Failed to save teamsheet.', type: 'error' })
    } finally {
      setSavingTeamsheet(false)
    }
  }

  // --- Leaderboard ---
  const [lbRoundFilter, setLbRoundFilter] = useState<string>('season') // 'season' | roundId
  const [lbSubtab, setLbSubtab] = useState<'votes' | 'goals' | 'assists'>('votes')
  const [lbWeekCutoff, setLbWeekCutoff] = useState<number>(22)

  const buildLeaderboard = (team: Team): LeaderboardEntry[] => {
    const roundNumById = Object.fromEntries(rounds.map(r => [r.id, r.roundNumber]))
    const filteredVotes = votes.filter(v => {
      if (v.team !== team) return false
      if (lbRoundFilter !== 'season') return v.roundId === lbRoundFilter
      return (roundNumById[v.roundId] ?? 0) <= lbWeekCutoff
    })
    return players
      .filter(p => p.role !== 'coach')
      .map(player => {
        const threes = filteredVotes.filter(v => v.points3 === player.id).length
        const twos   = filteredVotes.filter(v => v.points2 === player.id).length
        const ones   = filteredVotes.filter(v => v.points1 === player.id).length
        const total  = threes * 3 + twos * 2 + ones
        return { player, total, threes, twos, ones }
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total || b.threes - a.threes || b.twos - a.twos)
  }

  const buildStatsLeaderboard = (team: Team, stat: 'goals' | 'assists'): { player: Player; total: number }[] => {
    const filteredRounds = rounds.filter(r =>
      lbRoundFilter === 'season' ? r.roundNumber <= lbWeekCutoff : r.id === lbRoundFilter
    )
    const totals: Record<string, number> = {}
    for (const round of filteredRounds) {
      for (const [playerId, s] of Object.entries(round.stats?.[team] ?? {})) {
        totals[playerId] = (totals[playerId] ?? 0) + s[stat]
      }
    }
    return players
      .filter(p => p.role !== 'coach')
      .map(player => ({ player, total: totals[player.id] ?? 0 }))
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total)
  }

  // --- Shame List ---
  const allShameEntries = rounds.flatMap(round =>
    (['seniors', 'reserves'] as Team[]).flatMap(team => {
      if (new Date() < voteUnlockTime(round, team)) return []
      return round.teamsheets[team]
        .filter(playerId => !votes.some(v => v.voterId === playerId && v.team === team && v.roundId === round.id))
        .map(playerId => ({ player: players.find(p => p.id === playerId), round, team }))
        .filter(e => e.player != null) as { player: Player; round: Round; team: Team }[]
    })
  )

  // --- Players ---
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlayerName.trim()) return
    setAddingPlayer(true)
    try {
      const id = newPlayerName.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now()
      await setDoc(doc(db, 'players', id), { id, name: newPlayerName.trim(), pin: '', role: newPlayerRole })
      setToast({ message: `${newPlayerName.trim()} added!`, type: 'success' })
      setNewPlayerName('')
      await loadAll()
    } catch {
      setToast({ message: 'Failed to add player.', type: 'error' })
    } finally {
      setAddingPlayer(false)
    }
  }

  const handleDeletePlayer = async (player: Player) => {
    if (!confirm(`Remove ${player.name} from the squad?`)) return
    try {
      await deleteDoc(doc(db, 'players', player.id))
      setToast({ message: `${player.name} removed.`, type: 'success' })
      await loadAll()
    } catch {
      setToast({ message: 'Failed to remove player.', type: 'error' })
    }
  }

  // --- Notify Team ---
  const handleNotifyTeam = async (team: Team) => {
    if (!selectedRound) return
    setNotifyingTeam(team)
    try {
      const notify = httpsCallable<{ roundId: string; team: string }, { sent: number }>(functions, 'sendTeamNotification')
      const result = await notify({ roundId: selectedRound.id, team })
      setNotifyResult(prev => ({ ...prev, [team]: result.data.sent }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setToast({ message: `Notify failed: ${msg}`, type: 'error' })
    } finally {
      setNotifyingTeam(null)
    }
  }

  // --- Stats ---
  const handleSelectStatsRound = (round: Round) => {
    setStatsRound(round)
    setStatsResults({
      reserves: {
        goalsFor: round.results?.reserves?.goalsFor?.toString() ?? '',
        goalsAgainst: round.results?.reserves?.goalsAgainst?.toString() ?? '',
      },
      seniors: {
        goalsFor: round.results?.seniors?.goalsFor?.toString() ?? '',
        goalsAgainst: round.results?.seniors?.goalsAgainst?.toString() ?? '',
      },
    })
    setStatsPlayerStats({
      reserves: Object.fromEntries(
        Object.entries(round.stats?.reserves ?? {}).map(([id, s]) => [id, { goals: s.goals.toString(), assists: s.assists.toString() }])
      ),
      seniors: Object.fromEntries(
        Object.entries(round.stats?.seniors ?? {}).map(([id, s]) => [id, { goals: s.goals.toString(), assists: s.assists.toString() }])
      ),
    })
  }

  const handleSaveStats = async () => {
    if (!statsRound) return
    setSavingStats(true)
    try {
      const results: Round['results'] = {}
      for (const team of ['reserves', 'seniors'] as Team[]) {
        const { goalsFor, goalsAgainst } = statsResults[team]
        if (goalsFor !== '' || goalsAgainst !== '') {
          results[team] = {
            goalsFor: parseInt(goalsFor) || 0,
            goalsAgainst: parseInt(goalsAgainst) || 0,
          }
        }
      }
      const stats: Round['stats'] = {}
      for (const team of ['reserves', 'seniors'] as Team[]) {
        const teamStats: Record<string, PlayerStat> = {}
        for (const [playerId, s] of Object.entries(statsPlayerStats[team])) {
          const goals = parseInt(s.goals) || 0
          const assists = parseInt(s.assists) || 0
          if (goals > 0 || assists > 0) teamStats[playerId] = { goals, assists }
        }
        if (Object.keys(teamStats).length > 0) stats[team] = teamStats
      }
      await updateDoc(doc(db, 'rounds', statsRound.id), { results, stats })
      setToast({ message: 'Stats saved!', type: 'success' })
      await loadAll()
    } catch {
      setToast({ message: 'Failed to save stats.', type: 'error' })
    } finally {
      setSavingStats(false)
    }
  }

  // 'user' = new unread message; 'read' = opened but not yet replied (no badge)
  const supportUnread = supportRequests.filter(r => r.lastSenderRole === 'user').length

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'shame',       label: 'Shame List',  icon: AlertTriangle },
    { id: 'teamsheet',   label: 'Teamsheet',   icon: Users },
    { id: 'stats',       label: 'Stats',       icon: Target },
    { id: 'players',     label: 'Players',     icon: UserPlus },
    { id: 'setup',       label: 'Rounds',      icon: Calendar },
    { id: 'support',     label: 'Support',     icon: MessageSquare, badge: supportUnread || undefined },
    { id: 'fanzone',     label: 'Fan Zone',    icon: QrCode },
    { id: 'ladder',      label: 'Ladder',      icon: BarChart2 },
  ]

  if (!auth) return null

  return (
    <div className="min-h-screen flex flex-col">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Header title="Admin" isAdmin />

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-100 px-2 sticky top-0 z-10">
        <div className="flex overflow-x-auto gap-1 max-w-lg mx-auto">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-1.5 px-3 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === id ? 'border-club-green text-club-green' : 'border-transparent text-gray-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge ? (
                <span className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 bg-club-red text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-club-red" />
          </div>
        ) : (
          <>
            {/* LEADERBOARD */}
            {tab === 'leaderboard' && (
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-4">Leaderboard</h2>

                {/* Subtabs */}
                <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold mb-4">
                  {(['votes', 'goals', 'assists'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLbSubtab(s)}
                      className={`flex-1 py-2.5 capitalize transition-colors ${
                        lbSubtab === s ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Round filter */}
                <div className="relative mb-3">
                  <select
                    className="select-field text-sm"
                    value={lbRoundFilter}
                    onChange={e => setLbRoundFilter(e.target.value)}
                  >
                    <option value="season">Season Total</option>
                    {rounds.map(r => (
                      <option key={r.id} value={r.id}>
                        Rd {r.roundNumber} — vs {r.opponent} ({new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Week cutoff slider — season total only */}
                {lbRoundFilter === 'season' && (
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3 mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Up to Round</span>
                      <span className="text-sm font-black text-club-red">
                        {lbWeekCutoff === 22 ? `Rd ${lbWeekCutoff} (All)` : `Rd ${lbWeekCutoff}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={22}
                      value={lbWeekCutoff}
                      onChange={e => setLbWeekCutoff(Number(e.target.value))}
                      className="w-full accent-club-red"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Rd 1</span>
                      <span>Rd 22</span>
                    </div>
                  </div>
                )}

                {(['seniors', 'reserves'] as Team[]).map(team => {
                  const rankBg = (i: number) =>
                    i === 0 ? 'bg-amber-100 text-amber-600' :
                    i === 1 ? 'bg-gray-100 text-gray-600' :
                    i === 2 ? 'bg-orange-100 text-orange-600' :
                    'bg-gray-50 text-gray-400'

                  return (
                    <div key={team} className="mb-7">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-club-red text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {team === 'reserves' ? 'R' : 'S'}
                        </div>
                        <span className="font-bold text-gray-800">{TEAM_LABEL[team]}</span>
                      </div>

                      {lbSubtab === 'votes' && (() => {
                        const board = buildLeaderboard(team)
                        return board.length === 0 ? (
                          <p className="text-gray-400 text-sm px-1">No votes yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {board.map((entry, i) => (
                              <div key={entry.player.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${rankBg(i)}`}>
                                  {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-gray-900 truncate">{entry.player.name}</div>
                                  <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                                    <span className="text-amber-600 font-semibold">{entry.threes}×3</span>
                                    <span className="text-gray-500 font-semibold">{entry.twos}×2</span>
                                    <span className="text-orange-600 font-semibold">{entry.ones}×1</span>
                                  </div>
                                </div>
                                <div className="text-xl font-black text-club-red">{entry.total}</div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {(lbSubtab === 'goals' || lbSubtab === 'assists') && (() => {
                        const board = buildStatsLeaderboard(team, lbSubtab)
                        const label = lbSubtab === 'goals' ? 'goal' : 'assist'
                        return board.length === 0 ? (
                          <p className="text-gray-400 text-sm px-1">No {label}s recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {board.map((entry, i) => (
                              <div key={entry.player.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${rankBg(i)}`}>
                                  {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-gray-900 truncate">{entry.player.name}</div>
                                </div>
                                <div className="text-xl font-black text-club-red">{entry.total}</div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}

            {/* SHAME LIST */}
            {tab === 'shame' && (() => {
              const pastRounds = rounds.filter(r => new Date() >= voteUnlockTime(r, 'reserves'))
              const shameList = allShameEntries
                .filter(e => shameRoundFilter === 'all' || e.round.id === shameRoundFilter)
                .filter(e => shameTeamFilter === 'all' || e.team === shameTeamFilter)
              return (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Shame List</h2>
                  <p className="text-gray-500 text-sm mb-4">Players on past teamsheets who haven&apos;t voted</p>

                  {/* Filters */}
                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <select
                        className="select-field text-sm"
                        value={shameRoundFilter}
                        onChange={e => setShameRoundFilter(e.target.value)}
                      >
                        <option value="all">All Rounds</option>
                        {pastRounds.map(r => (
                          <option key={r.id} value={r.id}>
                            Rd {r.roundNumber} — vs {r.opponent}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-semibold shrink-0">
                      {(['all', 'reserves', 'seniors'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setShameTeamFilter(t)}
                          className={`px-3 py-2 transition-colors capitalize ${
                            shameTeamFilter === t ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {t === 'all' ? 'All' : t === 'reserves' ? 'Res' : 'Sen'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shameList.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-club-red font-semibold">Everyone has voted!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shameList.map(({ player, round, team }, i) => (
                        <div key={i} className="bg-white rounded-xl border border-red-100 p-4 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900">{player.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Rd {round.roundNumber} vs {round.opponent} · {TEAM_LABEL[team]}
                            </div>
                          </div>
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* TEAMSHEET */}
            {tab === 'teamsheet' && (
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-4">Weekly Teamsheet</h2>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Round</label>
                  <div className="relative">
                    <select
                      className="select-field"
                      value={selectedRound?.id ?? ''}
                      onChange={e => {
                        const r = rounds.find(r => r.id === e.target.value)
                        if (r) handleSelectRound(r)
                      }}
                    >
                      <option value="">Choose a round...</option>
                      {rounds.map(r => (
                        <option key={r.id} value={r.id}>
                          Rd {r.roundNumber} vs {r.opponent} — {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {selectedRound && (
                  <>
                    {(['seniors', 'reserves'] as Team[]).map(team => {
                      const selected = team === 'reserves' ? reservesSelected : seniorsSelected
                      const filter = teamFilter[team]
                      const sortedPlayers = [...players]
                        .filter(p => p.role !== 'coach')
                        .sort((a, b) => a.name.localeCompare(b.name))
                      const visiblePlayers = sortedPlayers.filter(p =>
                        filter === 'added' ? selected.includes(p.id) :
                        filter === 'unadded' ? !selected.includes(p.id) :
                        true
                      )
                      return (
                        <div key={team} className="mb-6">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-club-red text-white rounded-full flex items-center justify-center text-xs font-bold">
                                {team === 'reserves' ? 'R' : 'S'}
                              </div>
                              <span className="font-semibold text-gray-800">{TEAM_LABEL[team]}</span>
                              <span className="text-xs text-gray-400">({selected.length}/{players.length})</span>
                            </div>
                            {/* Filter toggle */}
                            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold">
                              {(['all', 'added', 'unadded'] as const).map(f => (
                                <button
                                  key={f}
                                  type="button"
                                  onClick={() => setTeamFilter(prev => ({ ...prev, [team]: f }))}
                                  className={`px-2.5 py-1.5 transition-colors capitalize ${
                                    filter === f
                                      ? 'bg-club-red text-white'
                                      : 'bg-white text-gray-500 hover:bg-gray-50'
                                  }`}
                                >
                                  {f === 'unadded' ? 'Not Added' : f === 'added' ? `Added` : 'All'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {visiblePlayers.length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-4">
                                {filter === 'added' ? 'No players added yet.' : 'All players have been added.'}
                              </p>
                            ) : (
                              visiblePlayers.map(player => {
                                const isSelected = selected.includes(player.id)
                                const num = playerNumbers[team]?.[player.id] ?? ''
                                return (
                                  <div
                                    key={player.id}
                                    className={`flex items-center rounded-xl border text-sm font-medium transition-colors overflow-hidden ${
                                      isSelected
                                        ? 'bg-club-red/10 border-club-red/30'
                                        : 'bg-white border-gray-100'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => togglePlayer(player.id, team)}
                                      className="flex-1 flex items-center justify-between px-4 py-3 text-left"
                                    >
                                      <span className={isSelected ? 'text-club-red font-semibold' : 'text-gray-700'}>{player.name}</span>
                                      {isSelected && (
                                        <span className="text-xs bg-club-red text-white px-2 py-0.5 rounded-full">✓</span>
                                      )}
                                    </button>
                                    {isSelected && (
                                      <div className="flex items-center border-l border-club-red/20 pr-3">
                                        <span className="pl-2 text-xs text-club-red/50 font-bold select-none">#</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder="—"
                                          value={num}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                                            setPlayerNumbers(prev => ({
                                              ...prev,
                                              [team]: { ...prev[team], [player.id]: val },
                                            }))
                                          }}
                                          className="w-10 bg-transparent text-sm font-bold text-club-red placeholder-club-red/30 focus:outline-none text-center py-3"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}

                    <button onClick={handleSaveTeamsheet} disabled={savingTeamsheet} className="btn-primary">
                      {savingTeamsheet ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </span>
                      ) : 'Save Teamsheet'}
                    </button>

                    <div className="mt-3 bg-gray-50 rounded-2xl border border-gray-100 p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notify players to vote</p>
                      <div className="flex gap-2">
                        {(['seniors', 'reserves'] as Team[]).map(team => {
                          const count = team === 'seniors' ? seniorsSelected.length : reservesSelected.length
                          const sent = notifyResult[team]
                          return (
                            <button
                              key={team}
                              type="button"
                              disabled={notifyingTeam !== null || count === 0}
                              onClick={() => {
                                setNotifyResult(prev => ({ ...prev, [team]: undefined }))
                                handleNotifyTeam(team)
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                                sent != null
                                  ? 'bg-club-green/10 text-club-green'
                                  : 'bg-club-red/10 text-club-red hover:bg-club-red/20'
                              }`}
                            >
                              {notifyingTeam === team ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : sent != null ? (
                                `✓ Sent to ${sent}`
                              ) : (
                                `Notify ${TEAM_LABEL[team]}`
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STATS */}
            {tab === 'stats' && (
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">Match Stats</h2>
                <p className="text-gray-500 text-sm mb-5">Record results and goalscorers after each match</p>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Round</label>
                  <div className="relative">
                    <select
                      className="select-field"
                      value={statsRound?.id ?? ''}
                      onChange={e => {
                        const r = rounds.find(r => r.id === e.target.value)
                        if (r) handleSelectStatsRound(r)
                      }}
                    >
                      <option value="">Choose a round...</option>
                      {rounds.map(r => (
                        <option key={r.id} value={r.id}>
                          Rd {r.roundNumber} vs {r.opponent} — {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {statsRound && (
                  <>
                    {(['seniors', 'reserves'] as Team[]).map(team => {
                      const teamPlayers = statsRound.teamsheets[team]
                        .map(id => players.find(p => p.id === id))
                        .filter(Boolean)
                        .sort((a, b) => a!.name.localeCompare(b!.name)) as Player[]

                      return (
                        <div key={team} className="mb-7">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-club-red text-white rounded-full flex items-center justify-center text-xs font-bold">
                                {team === 'reserves' ? 'R' : 'S'}
                              </div>
                              <span className="font-bold text-gray-800">{TEAM_LABEL[team]}</span>
                            </div>
                            <button
                              onClick={() => openNoticeboard(statsRound.id, team, TEAM_LABEL[team])}
                              className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-club-red transition-colors px-2.5 py-1.5 rounded-lg hover:bg-club-red/5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Noticeboard
                            </button>
                          </div>

                          {/* Score */}
                          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Result</div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <label className="block text-xs text-gray-400 mb-1">KDFC Goals</label>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={statsResults[team].goalsFor}
                                  onChange={e => setStatsResults(prev => ({ ...prev, [team]: { ...prev[team], goalsFor: e.target.value } }))}
                                  className="input-field text-center text-xl font-bold"
                                />
                              </div>
                              <span className="text-2xl font-black text-gray-300 mt-4">—</span>
                              <div className="flex-1">
                                <label className="block text-xs text-gray-400 mb-1">Opponent Goals</label>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={statsResults[team].goalsAgainst}
                                  onChange={e => setStatsResults(prev => ({ ...prev, [team]: { ...prev[team], goalsAgainst: e.target.value } }))}
                                  className="input-field text-center text-xl font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Goals & Assists */}
                          {teamPlayers.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Goals &amp; Assists</div>
                              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center">
                                <div className="text-xs font-semibold text-gray-400">Player</div>
                                <div className="text-xs font-semibold text-gray-400 text-center w-14">Goals</div>
                                <div className="text-xs font-semibold text-gray-400 text-center w-14">Assists</div>
                                {teamPlayers.map(player => (
                                  <>
                                    <div key={`name-${player.id}`} className="text-sm font-medium text-gray-800 truncate">{player.name}</div>
                                    <input
                                      key={`goals-${player.id}`}
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={statsPlayerStats[team][player.id]?.goals ?? ''}
                                      onChange={e => setStatsPlayerStats(prev => ({
                                        ...prev,
                                        [team]: { ...prev[team], [player.id]: { goals: e.target.value, assists: prev[team][player.id]?.assists ?? '' } }
                                      }))}
                                      className="w-14 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-club-red/30 focus:border-club-red"
                                    />
                                    <input
                                      key={`assists-${player.id}`}
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={statsPlayerStats[team][player.id]?.assists ?? ''}
                                      onChange={e => setStatsPlayerStats(prev => ({
                                        ...prev,
                                        [team]: { ...prev[team], [player.id]: { goals: prev[team][player.id]?.goals ?? '', assists: e.target.value } }
                                      }))}
                                      className="w-14 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-club-red/30 focus:border-club-red"
                                    />
                                  </>
                                ))}
                              </div>
                            </div>
                          )}
                          {teamPlayers.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-2">No teamsheet set for this team yet.</p>
                          )}
                        </div>
                      )
                    })}

                    <button onClick={handleSaveStats} disabled={savingStats} className="btn-primary">
                      {savingStats ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </span>
                      ) : 'Save Stats'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* PLAYERS */}
            {tab === 'players' && (
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-4">Squad Roster</h2>

                <form onSubmit={handleAddPlayer} className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                  <div className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-club-red" />
                    Add Player
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Full name..."
                      value={newPlayerName}
                      onChange={e => setNewPlayerName(e.target.value)}
                      className="input-field"
                    />
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                      <select
                        value={newPlayerRole}
                        onChange={e => setNewPlayerRole(e.target.value as 'player' | 'admin' | 'coach')}
                        className="select-field text-sm"
                      >
                        <option value="player">Player</option>
                        <option value="coach">Coach</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button type="submit" disabled={!newPlayerName.trim() || addingPlayer} className="btn-primary">
                      {addingPlayer ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Adding...
                        </span>
                      ) : 'Add to Squad'}
                    </button>
                  </div>
                </form>

                <div className="space-y-1">
                  {players.sort((a, b) => a.name.localeCompare(b.name)).map(player => (
                    <div key={player.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{player.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {player.role === 'admin' && (
                            <span className="text-xs bg-club-red/10 text-club-red font-semibold px-1.5 py-0.5 rounded">Admin</span>
                          )}
                          {player.role === 'coach' && (
                            <span className="text-xs bg-club-green/10 text-club-green font-semibold px-1.5 py-0.5 rounded">Coach</span>
                          )}
                          {!player.pin && !player.hasPin && (
                            <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-1.5 py-0.5 rounded">No PIN yet</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            if (!confirm(`Reset PIN for ${player.name}? They will need to set a new PIN on next login.`)) return
                            const adminPin = prompt('Enter your admin PIN to confirm:')
                            if (!adminPin) return
                            try {
                              await httpsCallable(functions, 'resetPin')({
                                playerId: player.id,
                                adminPlayerId: auth!.playerId,
                                adminPin,
                              })
                              alert(`PIN reset for ${player.name}`)
                            } catch (e: any) {
                              alert('Error: ' + (e.message ?? 'Failed'))
                            }
                          }}
                          className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                          title="Reset PIN"
                        >
                          Reset PIN
                        </button>
                        <button onClick={() => handleDeletePlayer(player)} className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ROUNDS / SETUP */}
            {tab === 'setup' && (
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-1">Rounds</h2>
                <p className="text-gray-500 text-sm mb-5">Add each fixture one by one</p>

                {/* Add Round Form */}
                <form onSubmit={handleAddRound} className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
                  <div className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-club-red" />
                    Add Round
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Opponent</label>
                      <input
                        type="text"
                        placeholder="e.g. Dandenong City FC"
                        value={newOpponent}
                        onChange={e => setNewOpponent(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Match Date</label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={e => setNewDate(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Seniors KO</label>
                        <input
                          type="time"
                          value={newKickOffTime}
                          onChange={e => {
                            setNewKickOffTime(e.target.value)
                            if (e.target.value) setNewReservesKickOff(deriveReservesKO(e.target.value))
                          }}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Reserves KO</label>
                        <input
                          type="time"
                          value={newReservesKickOff}
                          onChange={e => setNewReservesKickOff(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Ground / Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="e.g. Keysborough Reserve No.1"
                          value={newLocation}
                          onChange={e => setNewLocation(e.target.value)}
                          className="input-field pl-9"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Venue</label>
                      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
                        {(['home', 'away'] as const).map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setNewVenue(v)
                              if (v === 'home') setNewLocation(loc => loc || 'Parkmore Soccer Club')
                              else setNewLocation(loc => loc === 'Parkmore Soccer Club' ? '' : loc)
                            }}
                            className={`flex-1 py-3 capitalize transition-colors ${
                              newVenue === v ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {v === 'home' ? 'Home' : 'Away'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="submit" disabled={!newOpponent.trim() || !newDate || addingRound} className="btn-primary">
                      {addingRound ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Adding...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" /> Add Round {rounds.length > 0 ? rounds.length + 1 : 1}
                        </span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Round List */}
                {rounds.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">No rounds yet. Add your first fixture above.</p>
                ) : (
                  <div className="space-y-2">
                    {rounds.map(round => {
                      const isEditing = editingRoundId === round.id
                      if (isEditing) {
                        // ── Inline editor ──
                        return (
                          <div key={round.id} className="bg-white rounded-2xl border border-club-red/30 p-4 space-y-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-club-red uppercase tracking-wide">Rd {round.roundNumber} — Editing</span>
                              <button type="button" onClick={() => setEditingRoundId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Opponent */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Opponent</label>
                              <input
                                type="text"
                                value={editOpponent}
                                onChange={e => setEditOpponent(e.target.value)}
                                className="input-field"
                              />
                            </div>

                            {/* Date */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Match Date</label>
                              <input
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                className="input-field"
                              />
                            </div>

                            {/* Kick-off times */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Seniors KO</label>
                                <input
                                  type="time"
                                  value={editKickOffTime}
                                  onChange={e => {
                                    setEditKickOffTime(e.target.value)
                                    if (e.target.value) setEditReservesKickOff(deriveReservesKO(e.target.value))
                                  }}
                                  className="input-field"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Reserves KO</label>
                                <input
                                  type="time"
                                  value={editReservesKickOff}
                                  onChange={e => setEditReservesKickOff(e.target.value)}
                                  className="input-field"
                                />
                              </div>
                            </div>

                            {/* Location */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Ground / Location</label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                <input
                                  type="text"
                                  placeholder="e.g. Keysborough Reserve No.1"
                                  value={editLocation}
                                  onChange={e => setEditLocation(e.target.value)}
                                  className="input-field pl-9"
                                />
                              </div>
                            </div>

                            {/* Venue */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Venue</label>
                              <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
                                {(['home', 'away'] as const).map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => {
                                      setEditVenue(v)
                                      if (v === 'home') setEditLocation(loc => loc || 'Parkmore Soccer Club')
                                      else setEditLocation(loc => loc === 'Parkmore Soccer Club' ? '' : loc)
                                    }}
                                    className={`flex-1 py-2.5 capitalize transition-colors ${
                                      editVenue === v ? 'bg-club-red text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                  >
                                    {v === 'home' ? 'Home' : 'Away'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Save / Cancel */}
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSaveRoundEdit}
                                disabled={!editOpponent.trim() || !editDate || savingEdit}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-club-red text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
                              >
                                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save</>}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRoundId(null)}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      }

                      // ── Normal display card ──
                      return (
                        <div key={round.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                              Rd {round.roundNumber} · vs {round.opponent}
                              {round.venue && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  round.venue === 'home' ? 'bg-club-red/10 text-club-red' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {round.venue === 'home' ? 'Home' : 'Away'}
                                </span>
                              )}
                              {round.isLive && (
                                <span className="text-xs font-bold text-club-red bg-club-red/10 px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-0.5 animate-pulse">
                                  <Zap className="w-3 h-3" /> Live
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(round.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                              {(() => {
                                const sen = round.seniorsKickOff ?? round.kickOffTime
                                const res = round.reservesKickOff ?? (sen ? deriveReservesKO(sen) : null)
                                return sen ? ` · Sen ${sen}${res ? ` / Res ${res}` : ''}` : ''
                              })()}
                              <span className="ml-2">· {round.teamsheets.reserves.length}R / {round.teamsheets.seniors.length}S</span>
                            </div>
                            {round.location && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />{round.location}
                              </div>
                            )}
                            {(round.results?.reserves || round.results?.seniors) && (
                              <div className="flex gap-2 mt-1">
                                {round.results.reserves && (
                                  <span className="text-xs font-semibold text-gray-500">
                                    Res {round.results.reserves.goalsFor}–{round.results.reserves.goalsAgainst}
                                  </span>
                                )}
                                {round.results.seniors && (
                                  <span className="text-xs font-semibold text-gray-500">
                                    Sen {round.results.seniors.goalsFor}–{round.results.seniors.goalsAgainst}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-3">
                            <button
                              onClick={() => handleToggleLive(round)}
                              title={round.isLive ? 'Mark as not live' : 'Mark as live'}
                              className={`p-2 transition-colors ${round.isLive ? 'text-club-red' : 'text-gray-300 hover:text-club-red'}`}
                            >
                              <Zap className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => startEditRound(round)}
                              className="p-2 text-gray-300 hover:text-club-red transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteRound(round)} className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

              </div>
            )}
            {/* ── SUPPORT TAB ── */}
            {tab === 'support' && (
              <div>
                {supportChat ? (
                  /* ── Chat view ── */
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => { setActiveSupportId(null); setSupportMessages([]) }}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4 text-gray-600 rotate-180" />
                      </button>
                      <div className="min-w-0">
                        <div className="font-black text-gray-900 truncate">{supportChat.subject}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {supportChat.fanName} · {supportChat.fromApp === 'fans' ? 'Fan Zone' : 'MOTM'} ·{' '}
                          <span className={supportChat.status === 'open' ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                            {supportChat.status === 'open' ? 'Open' : 'Resolved'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleResolveRequest(supportChat.id, supportChat.status)}
                        className={`ml-auto shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${
                          supportChat.status === 'open'
                            ? 'border-green-200 text-green-700 hover:bg-green-50'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {supportChat.status === 'open' ? 'Mark Resolved' : 'Re-open'}
                      </button>
                    </div>

                    {/* Messages */}
                    <div className="space-y-2 mb-4 min-h-[200px]">
                      {supportMessages.map(m => {
                        const isAdmin = m.sender === 'admin'
                        return (
                          <div key={m.id} className={`flex gap-2 items-end ${isAdmin ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                              isAdmin ? 'bg-club-green text-white' : 'bg-club-red/10 text-club-red'
                            }`}>
                              {isAdmin ? 'A' : supportChat.fanName[0].toUpperCase()}
                            </div>
                            <div>
                              <p className={`text-[10px] font-bold mb-0.5 ${isAdmin ? 'text-right text-club-green' : 'text-gray-500'}`}>
                                {isAdmin ? 'You (Admin)' : supportChat.fanName}
                              </p>
                              <div className={`px-3 py-2 rounded-2xl text-sm break-words max-w-xs ${
                                isAdmin
                                  ? 'bg-club-green text-white rounded-br-none'
                                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
                              }`}>
                                {m.text}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Reply input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Reply as admin..."
                        value={adminReply}
                        onChange={e => setAdminReply(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdminReply() } }}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-green/30 bg-gray-50"
                      />
                      <button
                        onClick={handleAdminReply}
                        disabled={!adminReply.trim() || sendingReply}
                        className="w-10 h-10 bg-club-green rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-club-green/90 transition-colors"
                      >
                        {sendingReply ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <MessageSquare className="w-4 h-4 text-white" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Request list ── */
                  <div>
                    <h2 className="text-xl font-black text-gray-900 mb-1">Support &amp; Feature Requests</h2>
                    <p className="text-gray-500 text-sm mb-5">Messages from players and fans</p>
                    {supportRequests.length === 0 ? (
                      <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-10 text-center text-sm text-gray-400">
                        No support requests yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {supportRequests.map(r => {
                          const isUnread = r.lastSenderRole === 'user'
                          return (
                            <button key={r.id} onClick={() => openSupportChat(r)}
                              className={`w-full text-left border rounded-2xl px-4 py-3.5 transition-colors ${
                                isUnread
                                  ? 'bg-club-red/5 border-club-red/20 hover:bg-club-red/10'
                                  : 'bg-white border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {isUnread && <span className="w-2 h-2 rounded-full bg-club-red shrink-0" />}
                                  <span className="font-semibold text-gray-800 text-sm truncate">{r.subject}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    {r.fromApp === 'fans' ? 'Fan' : 'Player'}
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    r.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                                  }`}>
                                    {r.status === 'open' ? 'Open' : 'Resolved'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-400">{r.fanName}</span>
                                {r.lastMessage && (
                                  <span className="text-xs text-gray-400 truncate max-w-[180px]">{r.lastMessage}</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </main>

      {/* ── Noticeboard modal ── */}
            {/* ── FAN ZONE TAB ── */}
            {tab === 'fanzone' && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-black text-gray-900 text-base">Fan Zone QR Code</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Share this code so fans can sign up and join the live experience.</p>
                </div>

                {/* QR card */}
                <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-sm">
                  <div className="p-3 bg-white rounded-xl border-2 border-club-red/10">
                    <QRCodeSVG
                      value="https://keysborough-district-fans.web.app"
                      size={200}
                      fgColor="#c01e1e"
                      bgColor="#ffffff"
                      level="M"
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-bold text-gray-900 text-sm">Keysborough District Fan Zone</p>
                    <p className="text-xs text-gray-400">keysborough-district-fans.web.app</p>
                  </div>
                  <div className="flex gap-2 w-full">
                    <a
                      href="https://keysborough-district-fans.web.app"
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-club-red bg-club-red/5 hover:bg-club-red/10 border border-club-red/20 rounded-xl py-2.5 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Open App
                    </a>
                    <a
                      href="/fan-guide"
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl py-2.5 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Printable Guide
                    </a>
                  </div>
                </div>

                {/* Instructions card */}
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">How to use</p>
                  <ul className="text-sm text-amber-800 space-y-1.5 list-none">
                    <li>1. Display or print this QR code at the ground</li>
                    <li>2. Fans scan it and sign up with their name + PIN</li>
                    <li>3. They can follow the live feed, vote MOTM, and post messages</li>
                    <li>4. The <strong>Printable Guide</strong> link above has step-by-step fan instructions you can screenshot or print</li>
                  </ul>
                </div>
              </div>
            )}

            {/* ── LADDER TAB ── */}
            {tab === 'ladder' && (
              <AdminLadderTab />
            )}

      {noticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setNoticeModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <div className="font-black text-gray-900">{noticeModal.label} Noticeboard</div>
                <div className="text-xs text-gray-400 mt-0.5">Fan Messages for this match</div>
              </div>
              <button onClick={() => setNoticeModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Messages */}
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
