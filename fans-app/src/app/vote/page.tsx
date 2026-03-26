'use client'

import { useEffect, useState, Suspense } from 'react'
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round, Player, FanVote, FanMessage, Team } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import FanHeader from '@/components/FanHeader'
import { Loader2, Trophy, MessageCircle, CheckCircle, Send, BarChart2, Pencil, X } from 'lucide-react'

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

// Fixed, readable doc IDs — allows overwrite on edit
const voteDocId   = (team: Team, fanName: string) => `${team}_${fanName.replace(/[^a-zA-Z0-9]/g, '_')}`
const msgDocId    = (team: Team, playerId: string, fanName: string) =>
  `${team}_${playerId}_${fanName.replace(/[^a-zA-Z0-9]/g, '_')}`

function FanVoteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roundId = searchParams.get('roundId') ?? ''
  const team = (searchParams.get('team') ?? 'seniors') as Team

  const [round, setRound]         = useState<Round | null>(null)
  const [players, setPlayers]     = useState<Player[]>([])
  const [fanVotes, setFanVotes]   = useState<FanVote[]>([])
  const [myVote, setMyVote]       = useState<string | null>(null)   // playerId
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'vote' | 'messages'>('vote')

  // Messages: playerId → { docId, text } for my sent messages
  const [myMessages, setMyMessages] = useState<Record<string, { docId: string; text: string }>>({})
  const [selectedPlayer, setSelectedPlayer]   = useState<Player | null>(null)
  const [messageText, setMessageText]         = useState('')
  const [editingPlayer, setEditingPlayer]     = useState<string | null>(null) // playerId being edited
  const [sendingMessage, setSendingMessage]   = useState(false)

  const fanAuth = typeof window !== 'undefined' ? getStoredFanAuth() : null

  // Returns "#10 " prefix if a jersey number is stored for this player, else ""
  const playerNum = (playerId: string) => {
    const n = round?.numbers?.[team]?.[playerId]
    return n ? `#${n} ` : ''
  }

  useEffect(() => {
    if (!fanAuth) { router.replace('/'); return }
    if (!roundId) { router.replace('/rounds'); return }
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, team])

  // Real-time fan votes for live chart
  useEffect(() => {
    if (!roundId) return
    const unsub = onSnapshot(
      query(collection(db, 'rounds', roundId, 'fanVotes')),
      snap => setFanVotes(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as FanVote)).filter(v => v.team === team)
      )
    )
    return unsub
  }, [roundId, team])

  const loadData = async () => {
    try {
      const roundSnap = await getDoc(doc(db, 'rounds', roundId))
      if (!roundSnap.exists()) { router.replace('/rounds'); return }
      const roundData = { id: roundSnap.id, ...roundSnap.data() } as Round
      setRound(roundData)

      const teamsheet = roundData.teamsheets[team] ?? []
      const playerDocs = await Promise.all(teamsheet.map(id => getDoc(doc(db, 'players', id))))
      setPlayers(
        playerDocs.filter(d => d.exists())
          .map(d => ({ id: d.id, ...d.data() } as Player))
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      if (fanAuth) {
        // Check existing vote
        const vId = voteDocId(team, fanAuth.fanName)
        const vSnap = await getDoc(doc(db, 'rounds', roundId, 'fanVotes', vId))
        if (vSnap.exists()) setMyVote((vSnap.data() as FanVote).playerId)

        // Load all my messages for this round+team
        const msgSnap = await getDocs(collection(db, 'rounds', roundId, 'messages'))
        const mine: Record<string, { docId: string; text: string }> = {}
        msgSnap.docs.forEach(d => {
          const data = d.data() as FanMessage
          if (data.fanId === fanAuth.fanId && data.team === team) {
            mine[data.playerId] = { docId: d.id, text: data.message }
          }
        })
        setMyMessages(mine)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async (playerId: string) => {
    if (!fanAuth || myVote) return   // can't vote while a vote is already set — must cancel first
    const ts = Date.now()
    const vId = voteDocId(team, fanAuth.fanName)
    const vote: FanVote = { id: vId, fanId: fanAuth.fanId, roundId, team, playerId, timestamp: ts }
    await setDoc(doc(db, 'rounds', roundId, 'fanVotes', vId), vote)
    setMyVote(playerId)
  }

  const handleCancelVote = async () => {
    if (!fanAuth) return
    const vId = voteDocId(team, fanAuth.fanName)
    await deleteDoc(doc(db, 'rounds', roundId, 'fanVotes', vId))
    setMyVote(null)
  }

  const handleSendMessage = async () => {
    if (!fanAuth || !selectedPlayer || !messageText.trim()) return
    setSendingMessage(true)
    try {
      const mId = msgDocId(team, selectedPlayer.id, fanAuth.fanName)
      const msgData: Omit<FanMessage, 'id'> = {
        fanId: fanAuth.fanId,
        fanName: fanAuth.fanName,
        playerId: selectedPlayer.id,
        team,
        roundId,
        message: messageText.trim(),
        timestamp: Date.now(),
      }
      await setDoc(doc(db, 'rounds', roundId, 'messages', mId), msgData)
      setMyMessages(prev => ({ ...prev, [selectedPlayer.id]: { docId: mId, text: messageText.trim() } }))
      setMessageText('')
      setSelectedPlayer(null)
      setEditingPlayer(null)
    } finally {
      setSendingMessage(false)
    }
  }

  const startEditMessage = (player: Player) => {
    const existing = myMessages[player.id]
    setSelectedPlayer(player)
    setMessageText(existing?.text ?? '')
    setEditingPlayer(player.id)
  }

  const voteTally = players.map(p => ({
    player: p,
    count: fanVotes.filter(v => v.playerId === p.id).length,
  })).sort((a, b) => b.count - a.count)

  const maxVotes = Math.max(...voteTally.map(v => v.count), 1)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-club-red" />
    </div>
  )
  if (!round || !fanAuth) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <FanHeader fanName={fanAuth.fanName} />

      {/* Page title bar */}
      <div className="bg-club-red/5 border-b border-club-red/10 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="text-xs text-club-red font-semibold uppercase tracking-widest">{TEAM_LABEL[team]}</div>
          <div className="font-black text-gray-900 text-lg leading-tight">vs {round.opponent}</div>
          <div className="text-xs text-gray-400 mt-0.5">Round {round.roundNumber} · Fan Zone</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex">
          {(['vote', 'messages'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3.5 text-sm font-bold transition-all ${
                activeTab === tab ? 'text-club-red border-b-2 border-club-red' : 'text-gray-400'
              }`}
            >
              {tab === 'vote' ? (
                <span className="flex items-center justify-center gap-1.5">
                  <BarChart2 className="w-4 h-4" /> Fan MOTM
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <MessageCircle className="w-4 h-4" /> Shoutouts
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* ── Fan MOTM Vote ── */}
        {activeTab === 'vote' && (
          <div className="space-y-4">
            {!myVote ? (
              <>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Who was your MOTM?</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Tap a player to cast your fan vote.</p>
                </div>
                <div className="space-y-2">
                  {players.map(player => (
                    <button
                      key={player.id}
                      onClick={() => handleVote(player.id)}
                      className={`w-full flex items-center justify-between bg-white border rounded-2xl px-4 py-3.5 hover:border-club-red/30 hover:shadow-sm transition-all group text-left ${
                        player.id === myVote ? 'border-club-red/40 bg-club-red/5' : 'border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-club-red">{player.name[0]}</span>
                        </div>
                        <span className="font-semibold text-gray-800">{playerNum(player.id)}{player.name}</span>
                      </div>
                      {player.id === myVote
                        ? <CheckCircle className="w-4 h-4 text-club-red" />
                        : <Trophy className="w-4 h-4 text-gray-200 group-hover:text-club-red transition-colors" />
                      }
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Voted — show confirmation + chart + change button */}
                <div className="flex items-center justify-between bg-club-green/10 border border-club-green/20 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-club-green shrink-0" />
                    <div>
                      <span className="text-sm font-semibold text-club-green">Vote cast</span>
                      <span className="text-sm text-gray-500 ml-1.5">
                        {(() => { const p = players.find(p => p.id === myVote); return p ? `for ${playerNum(p.id)}${p.name}` : '' })()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelVote}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-club-red transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel vote
                  </button>
                </div>

                <div>
                  <h2 className="text-base font-bold text-gray-900 mb-1">Fan MOTM Results</h2>
                  <p className="text-xs text-gray-400 mb-3">{fanVotes.length} vote{fanVotes.length !== 1 ? 's' : ''} · updates live</p>
                  <div className="space-y-2.5">
                    {voteTally.map(({ player, count }, i) => (
                      <div key={player.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {i === 0 && count > 0 && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                            <span className={`text-sm font-semibold ${player.id === myVote ? 'text-club-red' : 'text-gray-700'}`}>
                              {playerNum(player.id)}{player.name}
                              {player.id === myVote && <span className="text-xs text-club-red/70 ml-1">(your vote)</span>}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-400">{count}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              i === 0 && count > 0 ? 'bg-amber-400' :
                              player.id === myVote ? 'bg-club-red' : 'bg-gray-300'
                            }`}
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

        {/* ── Shoutouts ── */}
        {activeTab === 'messages' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">Shoutouts</h2>
              <p className="text-sm text-gray-500 mt-0.5">Send a message to a player. You can edit it any time.</p>
            </div>
            <div className="space-y-2">
              {players.map(player => {
                const existing = myMessages[player.id]
                const isComposing = selectedPlayer?.id === player.id
                const isEditing = editingPlayer === player.id

                return (
                  <div key={player.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => {
                        if (isComposing) {
                          setSelectedPlayer(null)
                          setEditingPlayer(null)
                          setMessageText('')
                        } else {
                          startEditMessage(player)
                        }
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-all ${
                        isComposing ? 'bg-club-red/5' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-club-red">{player.name[0]}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-800">{playerNum(player.id)}{player.name}</span>
                          {existing && !isComposing && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{existing.text}</div>
                          )}
                        </div>
                      </div>
                      {existing ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-club-green shrink-0">
                          {isComposing ? (
                            <span className="text-gray-400">Cancel</span>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" />
                              <Pencil className="w-3 h-3 text-gray-400 ml-0.5" />
                            </>
                          )}
                        </span>
                      ) : (
                        <MessageCircle className={`w-4 h-4 transition-colors shrink-0 ${isComposing ? 'text-club-red' : 'text-gray-300'}`} />
                      )}
                    </button>

                    {isComposing && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-50">
                        <textarea
                          placeholder={`Write something for ${player.name}...`}
                          value={messageText}
                          onChange={e => setMessageText(e.target.value.slice(0, 200))}
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 resize-none mt-3"
                          autoFocus
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{messageText.length}/200</span>
                          <button
                            onClick={handleSendMessage}
                            disabled={!messageText.trim() || sendingMessage}
                            className="flex items-center gap-1.5 bg-club-red text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {sendingMessage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {isEditing ? 'Update' : 'Send'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function FanVotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-club-red" /></div>}>
      <FanVoteInner />
    </Suspense>
  )
}
