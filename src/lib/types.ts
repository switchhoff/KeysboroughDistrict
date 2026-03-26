export type Team = 'reserves' | 'seniors'

export interface Player {
  id: string
  name: string
  pin: string
  role: 'admin' | 'player' | 'coach'
  pushSubscription?: object // Web Push PushSubscription JSON
}

export interface RoundResult {
  goalsFor: number
  goalsAgainst: number
}

export interface PlayerStat {
  goals: number
  assists: number
}

export interface Round {
  id: string
  roundNumber: number
  date: string // ISO date string YYYY-MM-DD
  kickOffTime: string // HH:MM — used to compute vote unlock (kickOff + 90min)
  opponent: string
  venue: 'home' | 'away'
  teamsheets: {
    reserves: string[] // playerIds
    seniors: string[]  // playerIds
  }
  results?: {
    reserves?: RoundResult
    seniors?: RoundResult
  }
  stats?: {
    reserves?: Record<string, PlayerStat>  // playerId -> { goals, assists }
    seniors?: Record<string, PlayerStat>
  }
  notified?: {
    reserves?: boolean
    seniors?: boolean
  }
}

export interface Vote {
  id: string // {team}_{playerId}  — document ID within rounds/{roundId}/votes
  voterId: string
  roundId: string
  team: Team
  points3: string // playerId
  points2: string // playerId
  points1: string // playerId
  timestamp: number
}

export interface AuthState {
  playerId: string
  authToken: string
  name: string
  role: 'admin' | 'player' | 'coach'
}

export interface PendingVote {
  round: Round
  team: Team
}

// ── Fan (spectator) types ──────────────────────────────────────────────────

export interface Fan {
  id: string
  name: string
  pin: string
  createdAt: number
}

export interface FanAuthState {
  fanId: string
  fanName: string
}

export interface FanVote {
  id: string          // {team}_{fanId}
  fanId: string
  roundId: string
  team: Team
  playerId: string    // single vote — fan picks their favourite player
  timestamp: number
}

export interface FanMessage {
  id: string
  fanId: string
  fanName: string
  playerId: string    // player being messaged
  team: Team
  roundId: string
  message: string
  timestamp: number
}
