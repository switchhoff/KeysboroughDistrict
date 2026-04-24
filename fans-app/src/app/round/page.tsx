'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { doc, getDoc, collection, onSnapshot, addDoc, deleteDoc, updateDoc, setDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round, Player, Team, FanVote } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FanHeader from '@/components/FanHeader'
import { Loader2, Trophy, MessageCircle, Send, Trash2, X, Zap, Pencil, CheckCircle, ChevronLeft, MapPin } from 'lucide-react'

// ── Confetti ──────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#c01e1e', '#1e6b3a', '#fbbf24', '#ffffff', '#3b82f6', '#f97316']

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const pieces = Array.from({ length: 100 }, () => ({
      x:    Math.random() * canvas.width,
      y:    -10 - Math.random() * 120,
      w:    6 + Math.random() * 8,
      h:    3 + Math.random() * 4,
      vy:   3 + Math.random() * 4,
      vx:   (Math.random() - 0.5) * 2,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }))

    const start = Date.now()
    let frame: number

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const elapsed = Date.now() - start
      const fade = Math.max(0, 1 - (elapsed - 2000) / 1500)

      ctx.globalAlpha = fade
      pieces.forEach(p => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()

        p.y     += p.vy
        p.x     += p.vx + Math.sin(elapsed / 200 + p.x) * 0.5
        p.angle += p.spin
      })

      if (elapsed < 3500) {
        frame = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active])

  if (!active) return null
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function fmtKO(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `KO ${(h % 12 || 12)}:${m.toString().padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
function deriveReservesKO(seniorsHHMM: string): string {
  const [h, m] = seniorsHHMM.split(':').map(Number)
  const rh = ((h - 2) + 24) % 24
  return `${String(rh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
function fmtStamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const voteDocId = (team: Team, fanName: string) => `${team}_${fanName.replace(/[^a-zA-Z0-9]/g, '_')}`

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoalEvent {
  id: string; fanId: string; fanName: string
  team: Team; type?: 'goal' | 'kickoff' | 'halftime' | 'second_half' | 'whistle'
  scoredBy?: 'kdfc' | 'opponent'
  playerNumber?: string; playerName?: string
  timestamp: number
}
interface ChatMsg {
  id: string; fanId: string; fanName: string
  message: string; team?: Team; timestamp: number
}

type PrimaryTab = 'game' | 'vote' | 'messages'

const PRIMARY_TABS: { id: PrimaryTab; label: string; icon: React.ElementType }[] = [
  { id: 'game',     label: 'Game',     icon: Zap           },
  { id: 'vote',     label: 'Fan MOTM', icon: Trophy        },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
]

// ── Segmented toggle ──────────────────────────────────────────────────────────
function Toggle<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            value === o.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
          }`}
        >{o.label}</button>
      ))}
    </div>
  )
}

// ── Main inner component ───────────────────────────────────────────────────────
function FanRoundInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const roundId      = searchParams.get('roundId') ?? ''

  const [round,      setRound]      = useState<Round | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [fanAuth,    setFanAuth]    = useState<{ fanId: string; fanName: string } | null>(null)
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('game')
  const [activeTeam, setActiveTeam] = useState<Team>('seniors')

  const [seniorsPlayers,  setSeniorsPlayers]  = useState<Player[]>([])
  const [reservesPlayers, setReservesPlayers] = useState<Player[]>([])

  const [goals,    setGoals]    = useState<GoalEvent[]>([])
  const [chat,     setChat]     = useState<ChatMsg[]>([])
  const [fanVotes, setFanVotes] = useState<FanVote[]>([])

  const [myVotes, setMyVotes] = useState<Record<Team, string | null>>({ seniors: null, reserves: null })

  const [addingGoal,       setAddingGoal]       = useState(false)
  const [goalTeam,         setGoalTeam]         = useState<Team>('seniors')
  const [goalScoredBy,     setGoalScoredBy]     = useState<'kdfc' | 'opponent'>('kdfc')
  const [goalPlayerNum,    setGoalPlayerNum]    = useState('')
  const [goalPlayerName,   setGoalPlayerName]   = useState('')
  const [submittingGoal,       setSubmittingGoal]       = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [submittingPhase,      setSubmittingPhase]      = useState<Team | null>(null)
  const [confettiActive,       setConfettiActive]       = useState(false)
  const prevKdfcGoalCount = useRef(0)

  const [chatMsg,         setChatMsg]         = useState('')
  const [sendingChat,     setSendingChat]     = useState(false)
  const [editingChatId,   setEditingChatId]   = useState<string | null>(null)
  const [editingChatText, setEditingChatText] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const sortPlayers = (ids: string[], map: Record<string, Player>, team: Team, r: Round) =>
    ids.map(id => map[id]).filter(Boolean).sort((a, b) => {
      const na = parseInt(r.numbers?.[team]?.[a.id] ?? '')
      const nb = parseInt(r.numbers?.[team]?.[b.id] ?? '')
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      if (!isNaN(na)) return -1
      if (!isNaN(nb)) return 1
      return a.name.localeCompare(b.name)
    })

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const auth = getStoredFanAuth()
    if (!auth) { router.replace('/'); return }
    setFanAuth(auth)
    if (!roundId) { router.replace('/rounds'); return }

    // Live round document — fires immediately then updates on any admin change
    let roundLoaded = false
    const unsubRound = onSnapshot(doc(db, 'rounds', roundId), async snap => {
      if (!snap.exists()) { router.replace('/rounds'); return }
      const r = { id: snap.id, ...snap.data() } as Round
      setRound(r)

      // One-time: load players and existing fan votes
      if (!roundLoaded) {
        roundLoaded = true
        const allIds = [...new Set([...r.teamsheets.seniors, ...r.teamsheets.reserves])]
        const pDocs  = await Promise.all(allIds.map(id => getDoc(doc(db, 'players', id))))
        const pMap: Record<string, Player> = {}
        pDocs.filter(d => d.exists()).forEach(d => { pMap[d.id] = { id: d.id, ...d.data() } as Player })
        setSeniorsPlayers(sortPlayers(r.teamsheets.seniors, pMap, 'seniors', r))
        setReservesPlayers(sortPlayers(r.teamsheets.reserves, pMap, 'reserves', r))

        const [sv, rv] = await Promise.all([
          getDoc(doc(db, 'rounds', roundId, 'fanVotes', voteDocId('seniors',  auth.fanName))),
          getDoc(doc(db, 'rounds', roundId, 'fanVotes', voteDocId('reserves', auth.fanName))),
        ])
        setMyVotes({
          seniors:  sv.exists() ? (sv.data() as FanVote).playerId : null,
          reserves: rv.exists() ? (rv.data() as FanVote).playerId : null,
        })
        setLoading(false)
      }
    })

    const unsubGoals = onSnapshot(
      query(collection(db, 'rounds', roundId, 'goals'), orderBy('timestamp', 'asc')),
      snap => setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as GoalEvent)))
    )
    const unsubChat = onSnapshot(
      query(collection(db, 'rounds', roundId, 'chat'), orderBy('timestamp', 'asc')),
      snap => setChat(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)))
    )
    const unsubVotes = onSnapshot(
      query(collection(db, 'rounds', roundId, 'fanVotes')),
      snap => setFanVotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as FanVote)))
    )
    return () => { unsubRound(); unsubGoals(); unsubChat(); unsubVotes() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  useEffect(() => {
    if (primaryTab === 'messages') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, activeTeam, primaryTab])

  useEffect(() => {
    const count = goals.filter(g => (!g.type || g.type === 'goal') && g.scoredBy === 'kdfc').length
    if (count > prevKdfcGoalCount.current) {
      setConfettiActive(false)
      requestAnimationFrame(() => setConfettiActive(true))
      const t = setTimeout(() => setConfettiActive(false), 3600)
      prevKdfcGoalCount.current = count
      return () => clearTimeout(t)
    }
    prevKdfcGoalCount.current = count
  }, [goals])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const submitGoal = async () => {
    if (!fanAuth || submittingGoal) return
    // Rate-limit: block if any goal was logged in the last 10 seconds
    const recentGoal = goals.find(
      g => (!g.type || g.type === 'goal') && g.team === goalTeam && Date.now() - g.timestamp < 10_000
    )
    if (recentGoal) { setDuplicateWarning(true); return }
    setSubmittingGoal(true)
    try {
      await addDoc(collection(db, 'rounds', roundId, 'goals'), {
        fanId: fanAuth.fanId, fanName: fanAuth.fanName, team: goalTeam,
        scoredBy: goalScoredBy,
        ...(goalScoredBy === 'kdfc' && goalPlayerNum.trim()  ? { playerNumber: goalPlayerNum.trim()  } : {}),
        ...(goalScoredBy === 'kdfc' && goalPlayerName.trim() ? { playerName:   goalPlayerName.trim() } : {}),
        timestamp: Date.now(),
      })
      setGoalPlayerNum(''); setGoalPlayerName(''); setAddingGoal(false)
    } finally { setSubmittingGoal(false) }
  }

  const deleteGoal = (id: string) => deleteDoc(doc(db, 'rounds', roundId, 'goals', id))

  const advancePhase = async (team: Team, type: 'kickoff' | 'halftime' | 'second_half' | 'whistle') => {
    if (!fanAuth || submittingPhase) return
    setSubmittingPhase(team)
    try {
      await addDoc(collection(db, 'rounds', roundId, 'goals'), {
        fanId: fanAuth.fanId, fanName: fanAuth.fanName, team, type, timestamp: Date.now(),
      })
    } finally { setSubmittingPhase(null) }
  }

  const handleVote = async (team: Team, playerId: string) => {
    if (!fanAuth || myVotes[team]) return
    const vId = voteDocId(team, fanAuth.fanName)
    await setDoc(doc(db, 'rounds', roundId, 'fanVotes', vId),
      { id: vId, fanId: fanAuth.fanId, roundId, team, playerId, timestamp: Date.now() })
    setMyVotes(prev => ({ ...prev, [team]: playerId }))
  }

  const handleCancelVote = async (team: Team) => {
    if (!fanAuth) return
    await deleteDoc(doc(db, 'rounds', roundId, 'fanVotes', voteDocId(team, fanAuth.fanName)))
    setMyVotes(prev => ({ ...prev, [team]: null }))
  }

  const deleteChat = async (id: string) => {
    await deleteDoc(doc(db, 'rounds', roundId, 'chat', id))
    if (editingChatId === id) setEditingChatId(null)
  }
  const saveEditChat = async (id: string) => {
    const text = editingChatText.trim()
    if (!text) return
    await updateDoc(doc(db, 'rounds', roundId, 'chat', id), { message: text })
    setEditingChatId(null)
  }
  const sendChat = async () => {
    if (!fanAuth || !chatMsg.trim() || sendingChat) return
    setSendingChat(true)
    const msg = chatMsg.trim(); setChatMsg('')
    try {
      await addDoc(collection(db, 'rounds', roundId, 'chat'), {
        fanId: fanAuth.fanId, fanName: fanAuth.fanName,
        message: msg, team: activeTeam, timestamp: Date.now(),
      })
    } finally { setSendingChat(false) }
  }

  const playerNum = (team: Team, playerId: string) => {
    const n = round?.numbers?.[team]?.[playerId]
    return n ? `#${n} ` : ''
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )
  if (!round) return null

  const players       = activeTeam === 'seniors' ? seniorsPlayers : reservesPlayers
  const myVote        = myVotes[activeTeam]
  const teamEvents    = goals.filter(g => g.team === activeTeam)
  const teamGoals     = teamEvents.filter(g => !g.type || g.type === 'goal')
  const hasKickoff    = teamEvents.some(g => g.type === 'kickoff')
  const hasHalftime   = teamEvents.some(g => g.type === 'halftime')
  const hasSecondHalf = teamEvents.some(g => g.type === 'second_half')
  const hasWhistle    = teamEvents.some(g => g.type === 'whistle')
  // backward compat: goals logged without a kickoff event imply game started
  const gameStarted   = hasKickoff || teamGoals.length > 0
  type GamePhase = 'pre' | 'first_half' | 'half_time' | 'second_half' | 'full_time'
  const gamePhase: GamePhase =
    hasWhistle    ? 'full_time'   :
    hasSecondHalf ? 'second_half' :
    hasHalftime   ? 'half_time'   :
    gameStarted   ? 'first_half'  : 'pre'
  const liveScore     = {
    kdfc: teamGoals.filter(g => g.scoredBy === 'kdfc').length,
    opp:  teamGoals.filter(g => g.scoredBy === 'opponent').length,
  }
  const teamFanVotes  = fanVotes.filter(v => v.team === activeTeam)
  const teamChat      = chat.filter(m => !m.team || m.team === activeTeam)
  const isFormOpen    = addingGoal && goalTeam === activeTeam

  const voteTally = [...players].map(p => ({
    player: p, count: teamFanVotes.filter(v => v.playerId === p.id).length,
  })).sort((a, b) => b.count - a.count)
  const maxVotes = Math.max(...voteTally.map(v => v.count), 1)

  const accent = activeTeam === 'seniors'
    ? { text: 'text-club-red', bg: 'bg-club-red/10', hover: 'hover:bg-club-red/20',
        btn: 'bg-club-red hover:bg-club-red/90', ring: 'focus-within:ring-club-red/30', inputRing: 'focus:ring-club-red/30' }
    : { text: 'text-green-600', bg: 'bg-green-50',   hover: 'hover:bg-green-100',
        btn: 'bg-green-600 hover:bg-green-700', ring: 'focus-within:ring-green-500/30', inputRing: 'focus:ring-green-500/30' }

  const senKO    = round.seniorsKickOff  ?? round.kickOffTime ?? null
  const resKO    = round.reservesKickOff ?? (senKO ? deriveReservesKO(senKO) : null)
  const kickTime = activeTeam === 'reserves'
    ? (resKO ? fmtKO(resKO) : null)
    : (senKO ? fmtKO(senKO) : null)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Confetti active={confettiActive} />

      {/* Duplicate goal warning */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl space-y-3">
            <div className="text-2xl text-center">⚽</div>
            <h3 className="font-black text-gray-900 text-center text-base">Goal already logged!</h3>
            <p className="text-sm text-gray-500 text-center">
              Someone else just added a goal. Check the feed — if it&apos;s already there, no need to add it again.
            </p>
            <button
              onClick={() => setDuplicateWarning(false)}
              className="w-full bg-club-red text-white font-bold py-2.5 rounded-xl text-sm hover:bg-club-red/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <FanHeader fanName={fanAuth?.fanName} />

      {/* Round title bar with back button */}
      <div className="bg-club-red/5 border-b border-club-red/10 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/rounds"
            className="w-8 h-8 rounded-full bg-club-red/10 hover:bg-club-red/20 flex items-center justify-center shrink-0 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-club-red" />
          </Link>
          <div>
            <div className="text-xs text-club-red font-semibold uppercase tracking-widest">Round {round.roundNumber}</div>
            <div className="font-black text-gray-900 text-lg leading-tight">vs {round.opponent}</div>
            <div className="text-xs text-gray-400 mt-0.5">{formatDate(round.date)}</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <span className={`font-semibold ${round.venue === 'home' ? 'text-club-red' : 'text-gray-500'}`}>
                {round.venue === 'home' ? 'Home' : 'Away'}
              </span>
              {round.location && (
                <><span className="text-gray-300">·</span><MapPin className="w-3 h-3 shrink-0" />{round.location}</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky nav ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        {/* Primary tabs */}
        <div className="flex max-w-lg mx-auto px-1">
          {PRIMARY_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPrimaryTab(id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex-1 justify-center ${
                primaryTab === id
                  ? 'border-club-red text-club-red'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Secondary team switcher — conjoined slider */}
        <div className="max-w-lg mx-auto px-4 pb-2.5 mt-2">
          <div className="relative flex bg-gray-100 rounded-xl p-0.5">
            {/* sliding indicator */}
            <div
              className={`absolute top-0.5 bottom-0.5 rounded-[10px] transition-all duration-200 ${
                activeTeam === 'seniors' ? 'bg-club-red' : 'bg-green-600'
              }`}
              style={{
                left:  activeTeam === 'seniors' ? '2px' : 'calc(50% + 1px)',
                width: 'calc(50% - 3px)',
              }}
            />
            {(['seniors', 'reserves'] as Team[]).map(t => (
              <button key={t} onClick={() => setActiveTeam(t)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-[10px] relative z-10 transition-colors ${
                  activeTeam === t ? 'text-white' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t === 'seniors' ? 'Seniors' : 'Reserves'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <main className="flex-1 px-4 pt-5 max-w-lg mx-auto w-full pb-8">

        {/* kick-off pill */}
        {kickTime && (
          <p className="text-xs text-gray-400 mb-4">{kickTime}</p>
        )}

        {/* ── GAME tab ──────────────────────────────────────────────── */}
        {primaryTab === 'game' && (
          <div className="space-y-6">

            {/* Game Feed */}
            <div className="space-y-2">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="font-black text-gray-900 text-base leading-tight flex items-center gap-2">
                    Game Feed
                    {teamGoals.length > 0 && (() => {
                      const scoreCls =
                        liveScore.kdfc > liveScore.opp  ? 'bg-green-100 text-green-700' :
                        liveScore.kdfc === liveScore.opp ? 'bg-amber-100 text-amber-700' :
                                                           'bg-red-100 text-red-600'
                      return (
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${scoreCls}`}>
                          {liveScore.kdfc} – {liveScore.opp}
                        </span>
                      )
                    })()}
                    {gamePhase === 'full_time'   && <span className="text-xs font-bold text-gray-400">FT</span>}
                    {gamePhase === 'second_half' && <span className="text-xs font-bold text-blue-500">2nd</span>}
                    {gamePhase === 'half_time'   && <span className="text-xs font-bold text-amber-500">HT</span>}
                    {gamePhase === 'first_half'  && <span className="text-xs font-bold text-green-600">1st</span>}
                  </h2>
                  <p className="text-sm text-gray-400">Live match events</p>
                </div>
                {!isFormOpen && gamePhase !== 'full_time' && (
                  <div className="flex items-center gap-2">
                    {(gamePhase === 'first_half' || gamePhase === 'second_half') && (
                      <button
                        onClick={() => { setGoalTeam(activeTeam); setGoalScoredBy('kdfc'); setGoalPlayerNum(''); setGoalPlayerName(''); setAddingGoal(true) }}
                        className={`flex items-center gap-1 text-xs font-bold ${accent.text} ${accent.bg} ${accent.hover} px-3 py-1.5 rounded-full transition-colors`}
                      >
                        + Goal
                      </button>
                    )}
                    {gamePhase === 'pre' && (
                      <button
                        onClick={() => advancePhase(activeTeam, 'kickoff')}
                        disabled={submittingPhase === activeTeam}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                      >
                        {submittingPhase === activeTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : '▶ Kick Off'}
                      </button>
                    )}
                    {gamePhase === 'first_half' && (
                      <button
                        onClick={() => advancePhase(activeTeam, 'halftime')}
                        disabled={submittingPhase === activeTeam}
                        className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                      >
                        {submittingPhase === activeTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : '⏸ Half Time'}
                      </button>
                    )}
                    {gamePhase === 'half_time' && (
                      <button
                        onClick={() => advancePhase(activeTeam, 'second_half')}
                        disabled={submittingPhase === activeTeam}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                      >
                        {submittingPhase === activeTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : '▶ 2nd Half KO'}
                      </button>
                    )}
                    {gamePhase === 'second_half' && (
                      <button
                        onClick={() => advancePhase(activeTeam, 'whistle')}
                        disabled={submittingPhase === activeTeam}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                      >
                        {submittingPhase === activeTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : '⏱ Final Whistle'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isFormOpen && (
                <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Who scored?</p>
                    <Toggle
                      options={[
                        { value: 'kdfc'     as const, label: 'KDFC'         },
                        { value: 'opponent' as const, label: round.opponent },
                      ]}
                      value={goalScoredBy} onChange={setGoalScoredBy}
                    />
                  </div>
                  {goalScoredBy === 'kdfc' && (
                    <div className="flex gap-2">
                      <div className={`flex items-center border border-gray-200 rounded-xl bg-gray-50 focus-within:ring-2 ${accent.ring} overflow-hidden w-28 shrink-0`}>
                        <span className="pl-3 text-sm font-bold text-gray-400 select-none">#</span>
                        <input type="text" inputMode="numeric" placeholder="00" value={goalPlayerNum}
                          onChange={e => setGoalPlayerNum(e.target.value.replace(/\D/g, '').slice(0, 3))}
                          className="flex-1 min-w-0 px-1.5 py-2.5 text-sm bg-transparent focus:outline-none"
                        />
                      </div>
                      <input type="text" placeholder="Player name (optional)" value={goalPlayerName}
                        onChange={e => setGoalPlayerName(e.target.value)}
                        className={`flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent.inputRing} bg-gray-50`}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setAddingGoal(false); setGoalPlayerNum(''); setGoalPlayerName('') }}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl transition-colors"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button onClick={submitGoal} disabled={submittingGoal}
                      className={`flex-1 flex items-center justify-center gap-1.5 ${accent.btn} text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-50 transition-colors`}
                    >
                      {submittingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : '⚽ Add Goal'}
                    </button>
                  </div>
                </div>
              )}

              {teamEvents.length > 0 ? (
                <div className="space-y-1.5">
                  {teamEvents.map(g => {
                    const isWhistle = g.type === 'whistle'
                    const canDelete = g.fanId === fanAuth?.fanId

                    // ── Kick Off ──────────────────────────────────────────
                    if (g.type === 'kickoff') return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center justify-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                          <span className="text-base leading-none shrink-0">▶️</span>
                          <div className="text-center">
                            <div className="font-bold text-green-700 text-sm">Kick Off</div>
                            <div className="text-xs text-gray-400">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                          </div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )

                    // ── Half Time ──────────────────────────────────────────
                    if (g.type === 'halftime') return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center justify-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                          <span className="text-base leading-none shrink-0">⏸️</span>
                          <div className="text-center">
                            <div className="font-bold text-amber-700 text-sm">Half Time</div>
                            <div className="text-xs text-gray-400">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                          </div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )

                    // ── 2nd Half KO ───────────────────────────────────────
                    if (g.type === 'second_half') return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center justify-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                          <span className="text-base leading-none shrink-0">▶️</span>
                          <div className="text-center">
                            <div className="font-bold text-blue-700 text-sm">2nd Half Kick Off</div>
                            <div className="text-xs text-gray-400">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                          </div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )

                    // ── Full Time ──────────────────────────────────────────
                    if (isWhistle) return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center justify-center gap-2.5 bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5">
                          <span className="text-base leading-none shrink-0">⏱️</span>
                          <div className="text-center">
                            <div className="font-bold text-gray-600 text-sm">Full Time</div>
                            <div className="text-xs text-gray-400">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                          </div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )

                    // ── KDFC goal — red, left-aligned ──────────────────────
                    if (g.scoredBy === 'kdfc') return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className={`flex-1 ${accent.bg} border ${accent.text === 'text-club-red' ? 'border-club-red/20' : 'border-green-200'} rounded-xl px-4 py-2.5`}>
                          <div className={`font-semibold text-sm ${accent.text}`}>
                            ⚽ KDFC{(g.playerNumber || g.playerName) && (
                              <span className="font-medium opacity-80">
                                {' · '}{g.playerNumber && <span className="font-bold">#{g.playerNumber}</span>}
                                {g.playerNumber && g.playerName && ' '}{g.playerName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )

                    // ── Opposition goal — white, right-aligned ─────────────
                    return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-end gap-2.5">
                          <div className="text-right">
                            <div className="font-semibold text-gray-700 text-sm">{round.opponent} ⚽</div>
                            <div className="text-xs text-gray-400 mt-0.5">Submitted by {g.fanName} · {fmtStamp(g.timestamp)}</div>
                          </div>
                        </div>
                        {canDelete ? (
                          <button onClick={() => deleteGoal(g.id)} className="w-9 h-full min-h-[44px] flex items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-300 hover:text-red-400 hover:border-red-200 transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : <div className="w-9 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              ) : !isFormOpen && (
                <p className="text-xs text-gray-400 py-1">No events logged yet.</p>
              )}
            </div>

          </div>
        )}

        {/* ── FAN MOTM tab ──────────────────────────────────────────── */}
        {primaryTab === 'vote' && (
          <div className="space-y-3">
            <div className="mb-1">
              <h2 className="font-black text-gray-900 text-base leading-tight">Cast your vote for</h2>
              <p className="text-sm text-gray-400">Man of the Match</p>
            </div>
            {players.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Teamsheet not set yet.</p>
            ) : !myVote ? (
              <>
                <p className="text-xs text-gray-400">Tap a player to cast your fan vote.</p>
                {players.map(p => (
                  <button key={p.id} onClick={() => handleVote(activeTeam, p.id)}
                    className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:border-club-red/30 hover:shadow-sm transition-all group text-left"
                  >
                    <div className="flex items-center gap-3">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-gray-100 group-hover:border-club-red/30 transition-colors"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-club-red">
                            {round?.numbers?.[activeTeam]?.[p.id] ?? p.name[0]}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-gray-800 text-sm block">{p.name}</span>
                        {round?.numbers?.[activeTeam]?.[p.id] && (
                          <span className="text-xs text-gray-400">#{round.numbers[activeTeam]![p.id]}</span>
                        )}
                      </div>
                    </div>
                    <Trophy className="w-4 h-4 text-gray-200 group-hover:text-club-red transition-colors" />
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm font-semibold text-green-700">
                      Voted · {players.find(p => p.id === myVote)?.name}
                    </span>
                  </div>
                  <button onClick={() => handleCancelVote(activeTeam)}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-club-red transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-3">{teamFanVotes.length} vote{teamFanVotes.length !== 1 ? 's' : ''} · live</p>
                  <div className="space-y-2.5">
                    {voteTally.map(({ player, count }, i) => (
                      <div key={player.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {player.photoUrl ? (
                              <img src={player.photoUrl} alt={player.name}
                                className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-100"
                              />
                            ) : (
                              i === 0 && count > 0 && <Trophy className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span className={`text-sm font-semibold ${player.id === myVote ? 'text-club-red' : 'text-gray-700'}`}>
                              {round?.numbers?.[activeTeam]?.[player.id] && (
                                <span className="text-xs font-bold opacity-50 mr-1">#{round.numbers[activeTeam]![player.id]}</span>
                              )}
                              {player.name}
                              {player.id === myVote && <span className="text-xs text-club-red/60 ml-1">(you)</span>}
                            </span>
                            {player.photoUrl && i === 0 && count > 0 && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                          </div>
                          <span className="text-xs font-bold text-gray-400">{count}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${i === 0 && count > 0 ? 'bg-amber-400' : player.id === myVote ? 'bg-club-red' : 'bg-gray-300'}`}
                            style={{ width: count === 0 ? '0%' : `${(count / maxVotes) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MESSAGES tab ──────────────────────────────────────────── */}
        {primaryTab === 'messages' && (
          <div className="space-y-2">
            <div className="mb-1">
              <h2 className="font-black text-gray-900 text-base leading-tight">
                {activeTeam === 'seniors' ? 'Seniors' : 'Reserves'} Noticeboard
              </h2>
              <p className="text-sm text-gray-400">Post a message for the {activeTeam === 'seniors' ? 'Seniors' : 'Reserves'}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="h-52 overflow-y-auto p-3 space-y-3">
                {teamChat.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-center text-gray-400 text-sm">No messages yet. Be the first!</p>
                  </div>
                ) : teamChat.map(m => {
                  const isOwn     = m.fanId === fanAuth?.fanId
                  const isEditing = editingChatId === m.id
                  const initial   = m.fanName.charAt(0).toUpperCase()
                  return (
                    <div key={m.id} className={`flex gap-2 items-end ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${isOwn ? 'bg-club-red text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {initial}
                      </div>
                      <div className={`flex flex-col max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className={`text-[11px] font-bold ${isOwn ? 'text-club-red' : 'text-gray-600'}`}>{m.fanName}</span>
                          <span className="text-[10px] text-gray-400">{timeAgo(m.timestamp)}</span>
                          {isOwn && !isEditing && (
                            <div className={`flex items-center gap-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                              <button onClick={() => { setEditingChatId(m.id); setEditingChatText(m.message) }} className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => deleteChat(m.id)} className="p-0.5 text-gray-300 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex gap-1.5 items-center w-full">
                            <input autoFocus value={editingChatText} onChange={e => setEditingChatText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditChat(m.id); if (e.key === 'Escape') setEditingChatId(null) }}
                              className="flex-1 text-sm border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
                            />
                            <button onClick={() => saveEditChat(m.id)} className="text-xs font-bold text-club-red px-2 py-1.5 rounded-lg hover:bg-club-red/10 shrink-0">Save</button>
                            <button onClick={() => setEditingChatId(null)} className="text-xs font-bold text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-100 shrink-0">Cancel</button>
                          </div>
                        ) : (
                          <div className={`px-3 py-2 rounded-2xl text-sm break-words ${isOwn ? 'bg-club-red text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                            {m.message}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-gray-100 p-3 flex gap-2 items-center">
                <input type="text" placeholder="Post a message..." value={chatMsg}
                  onChange={e => setChatMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }}}
                  className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-club-red/30"
                />
                <button onClick={sendChat} disabled={!chatMsg.trim() || sendingChat}
                  className="w-10 h-10 bg-club-red rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity hover:bg-club-red/90"
                >
                  {sendingChat ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default function FanRoundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    }>
      <FanRoundInner />
    </Suspense>
  )
}
