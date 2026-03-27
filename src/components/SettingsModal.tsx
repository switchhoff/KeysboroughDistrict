'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, ChevronRight, ChevronLeft, Send, Loader2,
  Eye, EyeOff, MessageSquare, Plus,
} from 'lucide-react'
import {
  collection, addDoc, onSnapshot, query,
  where, orderBy, updateDoc, doc, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { AuthState, SupportRequest, SupportMessage } from '@/lib/types'

type View = 'menu' | 'pin' | 'support' | 'chat'

interface Props {
  auth: AuthState | null
  onClose: () => void
}

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SettingsModal({ auth, onClose }: Props) {
  const router = useRouter()

  const [view,       setView]       = useState<View>('menu')
  const [requests,   setRequests]   = useState<SupportRequest[]>([])
  const [activeReq,  setActiveReq]  = useState<SupportRequest | null>(null)
  const [messages,   setMessages]   = useState<SupportMessage[]>([])
  const [newMsg,     setNewMsg]     = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [newTitle,   setNewTitle]   = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [creating,   setCreating]   = useState(false)

  // PIN change
  const [oldPin,     setOldPin]     = useState('')
  const [newPin,     setNewPin]     = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin,    setShowPin]    = useState(false)
  const [pinError,   setPinError]   = useState('')
  const [pinSaving,  setPinSaving]  = useState(false)
  const [pinSuccess, setPinSuccess] = useState(false)

  const msgEndRef = useRef<HTMLDivElement>(null)

  // ── Load this player's support requests ─────────────────────────────────────
  useEffect(() => {
    if (!auth) return
    const unsub = onSnapshot(
      query(
        collection(db, 'support'),
        where('fanId', '==', auth.playerId),
        orderBy('timestamp', 'desc'),
      ),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportRequest))),
    )
    return () => unsub()
  }, [auth])

  // ── Load messages for active request ────────────────────────────────────────
  useEffect(() => {
    if (!activeReq) return
    const unsub = onSnapshot(
      query(collection(db, 'support', activeReq.id, 'messages'), orderBy('timestamp', 'asc')),
      snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage))),
    )
    return () => unsub()
  }, [activeReq])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleCreateRequest = async () => {
    if (!auth || !newTitle.trim() || !newSubject.trim() || creating) return
    setCreating(true)
    try {
      const now   = Date.now()
      const title = newTitle.trim()
      const body  = newSubject.trim()
      const ref   = await addDoc(collection(db, 'support'), {
        fanId: auth.playerId, fanName: auth.name,
        fromApp: 'motm', subject: title, status: 'open',
        timestamp: now, lastMessage: body, lastMessageAt: now, lastSenderRole: 'user',
      })
      await addDoc(collection(db, 'support', ref.id, 'messages'), {
        text: body, sender: 'user', senderName: auth.name, timestamp: now,
      })
      setNewTitle(''); setNewSubject('')
    } finally { setCreating(false) }
  }

  const handleSendMsg = async () => {
    if (!auth || !activeReq || !newMsg.trim() || sendingMsg) return
    setSendingMsg(true)
    const text = newMsg.trim(); setNewMsg('')
    try {
      const now = Date.now()
      await addDoc(collection(db, 'support', activeReq.id, 'messages'), {
        text, sender: 'user', senderName: auth.name, timestamp: now,
      })
      await updateDoc(doc(db, 'support', activeReq.id), {
        lastMessage: text, lastMessageAt: now, lastSenderRole: 'user',
      })
    } finally { setSendingMsg(false) }
  }

  const handleChangePin = useCallback(async () => {
    if (!auth) return
    setPinError(''); setPinSaving(true)
    try {
      const snap = await getDoc(doc(db, 'players', auth.playerId))
      if (!snap.exists()) { setPinError('Account not found.'); return }
      const player = snap.data()
      if (player.pin !== oldPin)  { setPinError('Current PIN is incorrect.'); return }
      if (newPin.length < 4)      { setPinError('New PIN must be at least 4 digits.'); return }
      if (newPin !== confirmPin)  { setPinError("PINs don't match."); return }
      await updateDoc(doc(db, 'players', auth.playerId), { pin: newPin })
      setPinSuccess(true)
      setOldPin(''); setNewPin(''); setConfirmPin('')
      setTimeout(() => { onClose(); router.replace('/') }, 2000)
    } finally { setPinSaving(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, oldPin, newPin, confirmPin])

  const goToChat = async (r: SupportRequest) => {
    setActiveReq(r); setView('chat')
    // Mark as read — clears the unread dot/bubble
    if (r.lastSenderRole === 'admin') {
      await updateDoc(doc(db, 'support', r.id), { lastSenderRole: 'read' })
    }
  }
  const goBack   = () => {
    if (view === 'chat') { setActiveReq(null); setView('support') }
    else                 { setView('menu') }
  }

  const unreadCount = requests.filter(r => r.lastSenderRole === 'admin').length
  const openCount   = requests.filter(r => r.status === 'open').length

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />

      {/* Bottom sheet */}
      <div
        className="bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'menu' && (
              <button onClick={goBack}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mr-1 shrink-0"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
            )}
            <span className="font-black text-gray-900 text-base">
              {view === 'menu'    ? 'Settings'       :
               view === 'pin'    ? 'Change PIN'      :
               view === 'support'? 'Support & Ideas' :
                                   (activeReq?.subject ?? 'Chat')}
            </span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* ── Not logged in ──────────────────────────────────────────────── */}
          {!auth && (
            <>
              <div className="bg-club-red/5 border border-club-red/10 rounded-2xl p-4">
                <p className="font-bold text-gray-900 mb-1">KDFC Man of the Match</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  The official MOTM voting app for Keysborough District FC players.
                  Log in with your player PIN to cast votes and track season stats.
                </p>
              </div>
              <a
                href="https://wa.me/61403326837"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3.5 hover:bg-green-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-green-800 text-sm">Contact on WhatsApp</div>
                  <div className="text-xs text-green-600 mt-0.5">+61 403 326 837</div>
                </div>
              </a>
            </>
          )}

          {/* ── Logged in: menu ─────────────────────────────────────────────── */}
          {auth && view === 'menu' && (
            <>
              <button onClick={() => setView('pin')}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl px-4 py-3.5 transition-colors"
              >
                <span className="font-semibold text-gray-800 text-sm">Change PIN</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
              <button onClick={() => setView('support')}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl px-4 py-3.5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">Support &amp; Feature Requests</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-black bg-club-red text-white rounded-full px-1.5 py-0.5 leading-none">
                      {unreadCount}
                    </span>
                  )}
                  {openCount > 0 && unreadCount === 0 && (
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 leading-none">
                      {openCount} open
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </>
          )}

          {/* ── Change PIN ──────────────────────────────────────────────────── */}
          {auth && view === 'pin' && (
            <>
              {pinSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm font-semibold text-green-700">
                  ✓ PIN updated successfully!
                </div>
              )}
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'} inputMode="numeric"
                  placeholder="Current PIN"
                  value={oldPin}
                  onChange={e => { setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50 pr-12"
                />
                <button onClick={() => setShowPin(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type={showPin ? 'text' : 'password'} inputMode="numeric"
                placeholder="New PIN (min 4 digits)"
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
              />
              <input
                type={showPin ? 'text' : 'password'} inputMode="numeric"
                placeholder="Confirm new PIN"
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
              />
              {pinError && <p className="text-sm text-red-500 font-medium">{pinError}</p>}
              <button
                onClick={handleChangePin}
                disabled={!oldPin || newPin.length < 4 || !confirmPin || pinSaving}
                className="w-full bg-club-red text-white rounded-2xl py-3 text-sm font-bold disabled:opacity-50 hover:bg-club-red/90 transition-opacity"
              >
                {pinSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save New PIN'}
              </button>
            </>
          )}

          {/* ── Support list ────────────────────────────────────────────────── */}
          {auth && view === 'support' && (
            <>
              {/* New request: title + message */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Title"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Describe your idea or issue..."
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateRequest() }}
                    className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
                  />
                  <button
                    onClick={handleCreateRequest}
                    disabled={!newTitle.trim() || !newSubject.trim() || creating}
                    className="w-10 h-10 bg-club-red rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-club-red/90 transition-colors"
                  >
                    {creating
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Plus className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>

              {requests.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No requests yet — send us your ideas or report a bug!
                </p>
              ) : requests.map(r => {
                const hasReply = r.lastSenderRole === 'admin'
                return (
                  <button key={r.id} onClick={() => goToChat(r)}
                    className={`w-full text-left border rounded-2xl px-4 py-3 transition-colors ${
                      hasReply
                        ? 'bg-club-red/5 border-club-red/20 hover:bg-club-red/10'
                        : 'bg-gray-50 border-gray-100 hover:border-club-red/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${hasReply ? 'text-club-red' : 'text-gray-400'}`} />
                        <span className="font-semibold text-gray-800 text-sm truncate">{r.subject}</span>
                        {hasReply && <span className="shrink-0 w-2 h-2 rounded-full bg-club-red" />}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        r.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {r.status === 'open' ? 'Open' : 'Resolved'}
                      </span>
                    </div>
                    {r.lastMessage && (
                      <p className="text-xs text-gray-400 mt-1 ml-5 truncate">{r.lastMessage}</p>
                    )}
                    {r.lastMessageAt && (
                      <p className="text-[10px] text-gray-300 mt-0.5 ml-5">{timeAgo(r.lastMessageAt)}</p>
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* ── Chat ────────────────────────────────────────────────────────── */}
          {auth && view === 'chat' && activeReq && (
            <div className="space-y-2 pb-1">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No replies yet — we&apos;ll get back to you soon!</p>
              ) : messages.map(m => {
                const isUser = m.sender === 'user'
                return (
                  <div key={m.id} className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isUser ? 'bg-club-red text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {isUser ? auth.name[0].toUpperCase() : 'A'}
                    </div>
                    <div>
                      <p className={`text-[10px] font-bold mb-0.5 ${isUser ? 'text-right text-club-red' : 'text-gray-500'}`}>
                        {isUser ? 'You' : 'Admin'} · {timeAgo(m.timestamp)}
                      </p>
                      <div className={`px-3 py-2 rounded-2xl text-sm break-words max-w-[72vw] ${
                        isUser ? 'bg-club-red text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={msgEndRef} />
            </div>
          )}
        </div>

        {/* Chat input */}
        {auth && view === 'chat' && activeReq && (
          <div className="border-t border-gray-100 px-5 py-3 flex gap-2 shrink-0">
            <input
              type="text"
              placeholder="Reply..."
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMsg() } }}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-club-red/30 bg-gray-50"
            />
            <button
              onClick={handleSendMsg}
              disabled={!newMsg.trim() || sendingMsg}
              className="w-10 h-10 bg-club-red rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-club-red/90 transition-colors"
            >
              {sendingMsg ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
