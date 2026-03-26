'use client'

import { useEffect, useState, Suspense } from 'react'
import { doc, getDoc, getDocs, collection, setDoc, addDoc, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Round, Player, FanVote, FanMessage, Team } from '@/lib/types'
import { getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ChevronLeft, Trophy, MessageCircle, CheckCircle, Send, BarChart2 } from 'lucide-react'

const TEAM_LABEL: Record<Team, string> = { reserves: 'Reserves', seniors: 'Seniors' }

function FanVoteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roundId = searchParams.get('roundId') ?? ''
  const team = (searchParams.get('team') ?? 'seniors') as Team

  const [round, setRound] = useState<Round | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [fanVotes, setFanVotes] = useState<FanVote[]>([])
  const [messages, setMessages] = useState<FanMessage[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)        // playerId I voted for
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'vote' | 'messages'>('vote')

  // Message composer
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [sentMessages, setSentMessages] = useState<Set<string>>(new Set()) // playerIds messaged

  const fanAuth = typeof window !== 'undefined' ? getStoredFanAuth() : null

  useEffect(() => {
    if (!fanAuth) { router.replace('/fans'); return }
    if (!roundId) { router.replace('/fans/rounds'); return }
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, team])

  // Real-time fan votes listener
  useEffect(() => {
    if (!roundId) return
    const unsub = onSnapshot(
      query(collection(db, 'rounds', roundId, 'fanVotes')),
      snap => setFanVotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as FanVote)).filter(v => v.team === team))
    )
    return unsub
  }, [roundId, team])

  // Real-time messages listener
  useEffect(() => {
    if (!roundId) return
    const unsub = onSnapshot(
      query(collection(db, 'rounds', roundId, 'messages')),
      snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as FanMessage)).filter(m => m.team === team))
    )
    return unsub
  }, [roundId, team])

  const loadData = async () => {
    try {
      const roundSnap = await getDoc(doc(db, 'rounds', roundId))
      if (!roundSnap.exists()) { router.replace('/fans/rounds'); return }
      const roundData = { id: roundSnap.id, ...roundSnap.data() } as Round
      setRound(roundData)

      const teamsheet = roundData.teamsheets[team] ?? []
      const playerDocs = await Promise.all(teamsheet.map(id => getDoc(doc(db, 'players', id))))
      const teamPlayers = playerDocs
        .filter(d => d.exists())
        .map(d => ({ id: d.id, ...d.data() } as Player))
        .sort((a, b) => a.name.localeCompare(b.name))
      setPlayers(teamPlayers)

      // Check if I already voted
      if (fanAuth) {
        const myVoteDoc = await getDoc(doc(db, 'rounds', roundId, 'fanVotes', `${team}_${fanAuth.fanId}`))
        if (myVoteDoc.exists()) setMyVote((myVoteDoc.data() as FanVote).playerId)
      }

      // Check messages I've already sent
      const msgSnap = await getDocs(collection(db, 'rounds', roundId, 'messages'))
      const sent = new Set(
        msgSnap.docs
          .filter(d => d.data().fanId === fanAuth?.fanId && d.data().team === team)
          .map(d => d.data().playerId as string)
      )
      setSentMessages(sent)
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async (playerId: string) => {
    if (!fanAuth || myVote) return
    const voteId = `${team}_${fanAuth.fanId}`
    const vote: FanVote = {
      id: voteId,
      fanId: fanAuth.fanId,
      roundId,
      team,
      playerId,
      timestamp: Date.now(),
    }
    await setDoc(doc(db, 'rounds', roundId, 'fanVotes', voteId), vote)
    setMyVote(playerId)
  }

  const handleSendMessage = async () => {
    if (!fanAuth || !selectedPlayer || !messageText.trim()) return
    setSendingMessage(true)
    try {
      await addDoc(collection(db, 'rounds', roundId, 'messages'), {
        fanId: fanAuth.fanId,
        fanName: fanAuth.fanName,
        playerId: selectedPlayer.id,
        team,
        roundId,
        message: messageText.trim(),
        timestamp: Date.now(),
      } as Omit<FanMessage, 'id'>)
      setSentMessages(prev => { const next = new Set(Array.from(prev)); next.add(selectedPlayer.id); return next })
      setMessageText('')
      setSelectedPlayer(null)
    } finally {
      setSendingMessage(false)
    }
  }

  // Build vote tally for chart
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
      {/* Header */}
      <div className="bg-club-red text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link href={`/fans/round?roundId=${round.id}`} className="flex items-center gap-1 text-red-200 text-sm mb-3 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <p className="text-red-200 text-sm font-semibold uppercase tracking-widest mb-1">{TEAM_LABEL[team]}</p>
          <h1 className="text-2xl font-black">vs {round.opponent}</h1>
          <p className="text-red-100 text-sm mt-1">Round {round.roundNumber} · Fan Vote</p>
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
                activeTab === tab
                  ? 'text-club-red border-b-2 border-club-red'
                  : 'text-gray-400'
              }`}
            >
              {tab === 'vote' ? (
                <span className="flex items-center justify-center gap-1.5">
                  <BarChart2 className="w-4 h-4" /> Fan MOTM
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <MessageCircle className="w-4 h-4" /> Shoutouts
                  {messages.length > 0 && (
                    <span className="bg-club-red text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {messages.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* ── Fan MOTM Vote Tab ── */}
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
                      className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-club-red/30 hover:shadow-sm transition-all group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-club-red">{player.name[0]}</span>
                        </div>
                        <span className="font-semibold text-gray-800">{player.name}</span>
                      </div>
                      <Trophy className="w-4 h-4 text-gray-200 group-hover:text-club-red transition-colors" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Voted — show confirmation + live chart */}
                <div className="flex items-center gap-2 bg-club-green/10 border border-club-green/20 rounded-2xl px-4 py-3">
                  <CheckCircle className="w-4 h-4 text-club-green shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-club-green">Vote cast</span>
                    <span className="text-sm text-gray-500 ml-1.5">
                      for {players.find(p => p.id === myVote)?.name}
                    </span>
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-bold text-gray-900 mb-1">Fan MOTM Results</h2>
                  <p className="text-xs text-gray-400 mb-3">{fanVotes.length} fan vote{fanVotes.length !== 1 ? 's' : ''} · updates live</p>
                  <div className="space-y-2.5">
                    {voteTally.map(({ player, count }, i) => (
                      <div key={player.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {i === 0 && count > 0 && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                            <span className={`text-sm font-semibold ${player.id === myVote ? 'text-club-red' : 'text-gray-700'}`}>
                              {player.name}
                              {player.id === myVote && <span className="text-xs text-club-red ml-1">(your vote)</span>}
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

        {/* ── Shoutouts Tab ── */}
        {activeTab === 'messages' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">Send a Shoutout</h2>
              <p className="text-sm text-gray-500 mt-0.5">Tap a player to write them a message. One message per player.</p>
            </div>

            {/* Player list for messaging */}
            <div className="space-y-2">
              {players.map(player => {
                const alreadySent = sentMessages.has(player.id)
                const playerMessages = messages.filter(m => m.playerId === player.id)
                return (
                  <div key={player.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => {
                        if (alreadySent) return
                        setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)
                        setMessageText('')
                      }}
                      disabled={alreadySent}
                      className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-all ${
                        alreadySent ? 'opacity-60' :
                        selectedPlayer?.id === player.id ? 'bg-club-red/5' :
                        'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-club-red/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-club-red">{player.name[0]}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-800">{player.name}</span>
                          {playerMessages.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">{playerMessages.length} shoutout{playerMessages.length !== 1 ? 's' : ''}</div>
                          )}
                        </div>
                      </div>
                      {alreadySent ? (
                        <span className="flex items-center gap-1 text-xs text-club-green font-semibold">
                          <CheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <MessageCircle className={`w-4 h-4 transition-colors ${selectedPlayer?.id === player.id ? 'text-club-red' : 'text-gray-300'}`} />
                      )}
                    </button>

                    {/* Composer */}
                    {selectedPlayer?.id === player.id && (
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
                            Send
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Show messages from others */}
                    {playerMessages.length > 0 && selectedPlayer?.id !== player.id && (
                      <div className="px-4 pb-3 space-y-2 border-t border-gray-50 pt-2">
                        {playerMessages.map(msg => (
                          <div key={msg.id} className="bg-gray-50 rounded-xl px-3 py-2">
                            <div className="text-xs font-semibold text-club-red mb-0.5">{msg.fanName}</div>
                            <div className="text-sm text-gray-700">{msg.message}</div>
                          </div>
                        ))}
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-club-red" />
      </div>
    }>
      <FanVoteInner />
    </Suspense>
  )
}
