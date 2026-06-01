import { LeagueMatch, LadderEntry } from './types'

export function computeLadder(matches: LeagueMatch[], competition: 'seniors' | 'reserves'): LadderEntry[] {
  const filtered = matches
    .filter(m => m.competition === competition)
    .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date))

  const map: Record<string, { w: number; d: number; l: number; gf: number; ga: number; results: ('W'|'D'|'L')[] }> = {}

  const ensure = (team: string) => {
    if (!map[team]) map[team] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, results: [] }
  }

  for (const m of filtered) {
    ensure(m.homeTeam)
    ensure(m.awayTeam)
    const h = map[m.homeTeam]
    const a = map[m.awayTeam]
    h.gf += m.homeScore; h.ga += m.awayScore
    a.gf += m.awayScore; a.ga += m.homeScore
    if (m.homeScore > m.awayScore) {
      h.w++; h.results.push('W')
      a.l++; a.results.push('L')
    } else if (m.homeScore === m.awayScore) {
      h.d++; h.results.push('D')
      a.d++; a.results.push('D')
    } else {
      h.l++; h.results.push('L')
      a.w++; a.results.push('W')
    }
  }

  return Object.entries(map).map(([team, s]) => {
    const played = s.w + s.d + s.l
    const pts = s.w * 3 + s.d
    const gd = s.gf - s.ga
    const form = s.results.slice(-5) as ('W'|'D'|'L')[]
    return { team, played, won: s.w, drawn: s.d, lost: s.l, gf: s.gf, ga: s.ga, gd, pts, form }
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
}
