export type Team = 'reserves' | 'seniors'

export interface Player {
  id: string
  name: string
  pin?: string      // legacy — removed after migration, use hasPin instead
  hasPin?: boolean  // set by setPin/migrate, safe to expose to clients
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
  kickOffTime: string     // HH:MM seniors KO — kept for backward compat
  seniorsKickOff?: string // HH:MM explicit seniors kick-off
  reservesKickOff?: string // HH:MM explicit reserves kick-off (default: seniorsKickOff - 2hrs)
  location?: string       // ground / venue name
  isLive?: boolean   // managed by Cloud Function hourly; can also be toggled manually
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
  numbers?: {
    reserves?: Record<string, string>  // playerId -> jersey number string
    seniors?: Record<string, string>
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

// ── Support / Feature Requests ────────────────────────────────────────────────

export interface SupportRequest {
  id: string
  fanId: string
  fanName: string
  fromApp: 'fans' | 'motm'
  subject: string
  status: 'open' | 'resolved'
  timestamp: number
  lastMessage?: string
  lastMessageAt?: number
  lastSenderRole?: 'user' | 'admin'  // for unread badge
}

export interface SupportMessage {
  id: string
  text: string
  sender: 'user' | 'admin'
  senderName: string
  timestamp: number
}

// ── League Ladder ─────────────────────────────────────────────────────────────

export interface LeagueMatch {
  id: string
  round: number
  date: string        // ISO YYYY-MM-DD
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  competition: 'seniors' | 'reserves'
}

export interface LadderEntry {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  pts: number
  form: ('W' | 'D' | 'L')[]  // last 5
}
