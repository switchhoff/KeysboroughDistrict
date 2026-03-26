'use client'

import Image from 'next/image'
import { LogOut } from 'lucide-react'
import { clearFanAuth } from '@/lib/fanAuth'
import { useRouter } from 'next/navigation'

interface FanHeaderProps {
  fanName?: string   // logged-in fan — shows logout when present
}

export default function FanHeader({ fanName }: FanHeaderProps) {
  const router = useRouter()

  const handleLogout = () => {
    clearFanAuth()
    router.replace('/')
  }

  return (
    <header className="bg-club-red text-white px-4">
      <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
        {/* Logo + title — always shown */}
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="KDFC" width={40} height={40} className="rounded-full shrink-0" />
          <div>
            <div className="font-black text-base leading-none">KDFC Fan Zone</div>
            <div className="text-white/60 text-xs mt-0.5">
              {fanName ? fanName : 'Man of the Match · 2026'}
            </div>
          </div>
        </div>

        {/* Logout when logged in */}
        {fanName && (
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  )
}
