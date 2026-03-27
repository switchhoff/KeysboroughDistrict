'use client'

import { useState } from 'react'
import { LogOut, Shield, Settings } from 'lucide-react'
import { clearAuth, useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import SettingsModal from './SettingsModal'

interface HeaderProps {
  title?: string
  isAdmin?: boolean
}

export default function Header({ title = 'KDFC MOTM', isAdmin = false }: HeaderProps) {
  const router = useRouter()
  const auth   = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <>
      <header className="bg-club-red text-white px-4">
        <div className="flex items-center justify-between py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Keysborough District FC"
              width={40}
              height={40}
              className="rounded-full"
            />
            <div>
              <div className="font-black text-base leading-none">{title}</div>
              {auth?.name && (
                <div className="text-white/70 text-xs mt-0.5">{auth.name}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {auth?.role === 'admin' && (
              <Link href={isAdmin ? '/' : '/admin'} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <Shield className={`w-5 h-5 ${isAdmin ? 'opacity-50' : ''}`} />
              </Link>
            )}
            <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            {auth && (
              <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {settingsOpen && (
        <SettingsModal auth={auth ?? null} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  )
}
