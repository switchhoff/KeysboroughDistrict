import { Round, Team } from './types'

/** Returns the kick-off time for a given team.
 *  Seniors kick-off is stored on the round; Reserves always kick off 2 hours earlier. */
export function kickOffTime(round: Round, team: Team): Date {
  if (!round.kickOffTime) return new Date(`${round.date}T12:00:00`)
  const seniors = new Date(`${round.date}T${round.kickOffTime}:00`)
  return team === 'reserves'
    ? new Date(seniors.getTime() - 2 * 60 * 60 * 1000)
    : seniors
}

/** Returns the datetime after which voting opens for a team (kick-off + 90 minutes) */
export function voteUnlockTime(round: Round, team: Team = 'seniors'): Date {
  return new Date(kickOffTime(round, team).getTime() + 90 * 60 * 1000)
}
