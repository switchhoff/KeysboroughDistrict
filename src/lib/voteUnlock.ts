import { Round, Team } from './types'

/** Returns the kick-off time for a given team.
 *  Uses explicit seniorsKickOff/reservesKickOff if set, otherwise falls back to kickOffTime. */
export function kickOffTime(round: Round, team: Team): Date {
  if (team === 'reserves') {
    if (round.reservesKickOff) return new Date(`${round.date}T${round.reservesKickOff}:00`)
    const sBase = round.seniorsKickOff ?? round.kickOffTime
    if (!sBase) return new Date(`${round.date}T10:00:00`)
    return new Date(new Date(`${round.date}T${sBase}:00`).getTime() - 2 * 60 * 60 * 1000)
  }
  const sBase = round.seniorsKickOff ?? round.kickOffTime
  return sBase ? new Date(`${round.date}T${sBase}:00`) : new Date(`${round.date}T12:00:00`)
}

/** Returns the datetime after which voting opens for a team (kick-off + 90 minutes) */
export function voteUnlockTime(round: Round, team: Team = 'seniors'): Date {
  return new Date(kickOffTime(round, team).getTime() + 90 * 60 * 1000)
}
