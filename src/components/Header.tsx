'use client'

import { LogOut, Shield } from 'lucide-react'
import { clearAuth, useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface HeaderProps {
  title?: string
  showBack?: boolean
}

export default function Header({ title = 'KDFC MOTM', showBack }: HeaderProps) {
  const router = useRouter()
  const auth = useAuth()

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
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
            <div className="text-white/60 text-xs">Man of the Match · 2026</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {auth?.role === 'admin' && (
            <Link href="/admin" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
