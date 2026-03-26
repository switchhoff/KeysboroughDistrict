'use client'

import { Round, Team } from '@/lib/types'
import { ChevronRight, Trophy } from 'lucide-react'
import Link from 'next/link'

interface VoteTileProps {
  round: Round
  team: Team
}

const TEAM_LABEL: Record<Team, string> = {
  reserves: 'Reserves',
  seniors: 'Seniors',
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function VoteTile({ round, team }: VoteTileProps) {
  return (
    <Link href={`/vote?roundId=${round.id}&team=${team}`}>
      <div className="vote-tile flex items-center justify-between group cursor-pointer hover:border-club-red/30 hover:shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-club-red/10 rounded-xl flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-club-red" />
          </div>
          <div>
            <div className="font-bold text-gray-900 text-base">
              vs {round.opponent}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">{formatDate(round.date)} · Rd {round.roundNumber}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 bg-club-red/10 text-club-red text-xs font-semibold px-2.5 py-1 rounded-full">
                {TEAM_LABEL[team]}
              </span>
              {round.venue && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  round.venue === 'home'
                    ? 'bg-club-green/10 text-club-green'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {round.venue === 'home' ? 'Home' : 'Away'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-club-green bg-club-green/10 px-3 py-1.5 rounded-full">Vote Now</span>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-club-red transition-colors" />
        </div>
      </div>
    </Link>
  )
}
