'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { LogOut, Settings } from 'lucide-react'
import { clearFanAuth, getStoredFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Team } from '@/lib/types'
import SettingsModal from './SettingsModal'

interface GoalEvent {
  id: string
  team: Team
  type?: 'goal' | 'whistle' | 'halftime'
  scoredBy?: 'kdfc' | 'opponent'
  timestamp: number
}

interface FanHeaderProps {
  fanName?: string
}

export default function FanHeader({ fanName }: FanHeaderProps) {
  const router = useRouter()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fanAuth,      setFanAuth]      = useState<{ fanId: string; fanName: string } | null>(null)

  const [liveRoundId, setLiveRoundId] = useState<string | null>(null)
  const [liveGoals,   setLiveGoals]   = useState<GoalEvent[]>([])

  useEffect(() => { setFanAuth(getStoredFanAuth()) }, [])

  // ── Listen for any live round ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'rounds'), where('isLive', '==', true)),
      snap => {
        if (snap.empty) { setLiveRoundId(null); setLiveGoals([]); return }
        setLiveRoundId(snap.docs[0].id)
      }
    )
    return () => unsub()
  }, [])

  // ── Subscribe to goals for the live round ────────────────────────────────────
  useEffect(() => {
    if (!liveRoundId) { setLiveGoals([]); return }
    const unsub = onSnapshot(
      query(collection(db, 'rounds', liveRoundId, 'goals'), orderBy('timestamp', 'asc')),
      snap => setLiveGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as GoalEvent)))
    )
    return () => unsub()
  }, [liveRoundId])

  const handleLogout = () => {
    clearFanAuth()
    router.replace('/')
  }

  // ── Score helpers ─────────────────────────────────────────────────────────────
  const teamScore = (team: Team) => {
    const evts = liveGoals.filter(g => g.team === team && !g.type && g.scoredBy)
    return {
      kdfc: evts.filter(g => g.scoredBy === 'kdfc').length,
      opp:  evts.filter(g => g.scoredBy === 'opponent').length,
    }
  }
  const teamStatus = (team: Team): 'ft' | 'ht' | 'live' => {
    const evts = liveGoals.filter(g => g.team === team)
    if (evts.some(e => e.type === 'whistle'))  return 'ft'
    if (evts.some(e => e.type === 'halftime')) return 'ht'
    return 'live'
  }

  const statusLabel = (s: 'ft' | 'ht' | 'live') =>
    s === 'ft' ? 'FT' : s === 'ht' ? 'HT' : '●'
  const statusCls = (s: 'ft' | 'ht' | 'live') =>
    s === 'ft'   ? 'text-white/50' :
    s === 'ht'   ? 'text-amber-300' :
    /* live */     'text-green-300 animate-pulse'

  const hasLive = liveRoundId !== null
  const snr = teamScore('seniors');  const snrSt = teamStatus('seniors')
  const res = teamScore('reserves'); const resSt = teamStatus('reserves')

  return (
    <>
    <header className="bg-club-red text-white px-4">
      <div className="flex items-center justify-between py-3 max-w-lg mx-auto">

        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="KDFC" width={40} height={40} className="rounded-full shrink-0" />
          <div>
            <div className="font-black text-base leading-none">KDFC Fan Zone</div>
            <div className="text-white/60 text-xs mt-0.5">
              {fanName ?? 'Man of the Match · 2026'}
            </div>
          </div>
        </div>

        {/* Right: live scoreboard + logout */}
        <div className="flex items-center gap-2">
          {hasLive && (
            <div className="flex flex-col items-end gap-0.5 bg-white/10 rounded-xl px-2.5 py-1.5 mr-0.5">
              {/* Seniors row */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide w-6">Snr</span>
                <span className="text-sm font-black tabular-nums">{snr.kdfc}–{snr.opp}</span>
                <span className={`text-[10px] font-black w-4 text-right ${statusCls(snrSt)}`}>
                  {statusLabel(snrSt)}
                </span>
              </div>
              {/* Reserves row */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide w-6">Res</span>
                <span className="text-sm font-black tabular-nums">{res.kdfc}–{res.opp}</span>
                <span className={`text-[10px] font-black w-4 text-right ${statusCls(resSt)}`}>
                  {statusLabel(resSt)}
                </span>
              </div>
            </div>
          )}

          <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <Settings className="w-5 h-5" />
          </button>

          {fanName && (
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>

      </div>
    </header>

    {settingsOpen && (
      <SettingsModal fanAuth={fanAuth} onClose={() => setSettingsOpen(false)} />
    )}
    </>
  )
}
