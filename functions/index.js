const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const functions = require('firebase-functions')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const webpush = require('web-push')
const crypto = require('crypto')

admin.initializeApp()

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY')

const VAPID_PUBLIC_KEY = 'BI_FH8gYwoLpSjktEdJ6e3vfxyYFlFiUPW2QQ62pnif7hglCV6qZiAFQVFkJ5G0crVBDSq7SEzSYVzuxSdigaOs'
const APP_URL = 'https://keysborough-district-motm.web.app'
const TEAM_LABEL = { reserves: 'Reserves', seniors: 'Seniors' }

exports.sendVoteReminders = onSchedule(
  { schedule: 'every 5 minutes', secrets: [VAPID_PRIVATE_KEY], region: 'australia-southeast1' },
  async () => {
    webpush.setVapidDetails(
      'mailto:admin@keysboroughdistrict.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY.value().trim()
    )

    const db = admin.firestore()
    const now = new Date()

    const roundsSnap = await db.collection('rounds').get()

    for (const roundDoc of roundsSnap.docs) {
      const round = roundDoc.data()
      if (!round.kickOffTime) continue

      for (const team of ['seniors', 'reserves']) {
        if (round.notified?.[team]) continue

        // Reserves kick off 2hrs before seniors
        const kickOff = new Date(`${round.date}T${round.kickOffTime}:00`)
        const teamKickOff = team === 'reserves'
          ? new Date(kickOff.getTime() - 2 * 60 * 60 * 1000)
          : kickOff
        const notifyAt = new Date(teamKickOff.getTime() + 90 * 60 * 1000)
        const windowEnd = new Date(notifyAt.getTime() + 5 * 60 * 1000)
        if (now < notifyAt || now > windowEnd) continue

        const teamsheet = round.teamsheets?.[team] ?? []
        const sends = []

        for (const playerId of teamsheet) {
          // Skip if already voted
          const voteId = `${team}_${playerId}`
          const voteSnap = await db.doc(`rounds/${roundDoc.id}/votes/${voteId}`).get()
          if (voteSnap.exists) continue

          // Get player push subscription
          const playerSnap = await db.collection('players').doc(playerId).get()
          const player = playerSnap.data()
          if (!player?.pushSubscription) continue

          sends.push(
            webpush.sendNotification(
              player.pushSubscription,
              JSON.stringify({
                title: 'Time to vote!',
                body: `${TEAM_LABEL[team]} vs ${round.opponent} — cast your 3-2-1 votes now`,
                url: APP_URL,
              })
            ).catch(err => {
              console.error(`Failed to notify ${playerId}:`, err.statusCode ?? err.message)
              // If subscription is expired/invalid, remove it
              if (err.statusCode === 410 || err.statusCode === 404) {
                return db.collection('players').doc(playerId).update({ pushSubscription: admin.firestore.FieldValue.delete() })
              }
            })
          )
        }

        await Promise.allSettled(sends)
        // Mark this team as notified so we don't re-send
        await roundDoc.ref.update({ [`notified.${team}`]: true })
        console.log(`Sent vote reminders: Rd ${round.roundNumber} ${team}`)
      }
    }
  }
)

// ── Auto live-round flag — runs every hour, every day ────────────────────
// isLive = true from 9:00am to 7:00pm Melbourne time on the round's game day.
exports.updateLiveRounds = onSchedule(
  {
    schedule: '0 * * * *', // every hour, every day
    timeZone: 'Australia/Melbourne',
    region: 'australia-southeast1',
  },
  async () => {
    const db = admin.firestore()
    const now = new Date()

    // Resolve current date and hour in Melbourne local time
    const melbParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hour12: false,
      })
        .formatToParts(now)
        .filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value])
    )
    const melbDate = `${melbParts.year}-${melbParts.month}-${melbParts.day}`
    const melbHour = parseInt(melbParts.hour, 10)

    const roundsSnap = await db.collection('rounds').get()
    const batch = db.batch()

    for (const roundDoc of roundsSnap.docs) {
      const round = roundDoc.data()
      if (!round.date) continue

      // Live from 9am up to (but not including) 7pm on game day
      const shouldBeLive = round.date === melbDate && melbHour >= 9 && melbHour < 19

      if (round.isLive !== shouldBeLive) {
        batch.update(roundDoc.ref, { isLive: shouldBeLive })
        console.log(`Round ${round.roundNumber} isLive → ${shouldBeLive} (Melbourne ${melbDate} ${melbHour}:xx)`)
      }
    }

    await batch.commit()
  }
)

const FANS_URL = 'https://keysborough-district-fans.web.app'

// ── Shared push helpers ───────────────────────────────────────────────────
async function getScore(db, roundId, team) {
  const goalsSnap = await db.collection('rounds').doc(roundId).collection('goals').get()
  let kdfc = 0, opp = 0
  goalsSnap.docs.forEach(d => {
    const g = d.data()
    if (g.team !== team || (g.type && g.type !== 'goal')) return
    if (g.scoredBy === 'kdfc')     kdfc++
    if (g.scoredBy === 'opponent') opp++
  })
  return `${kdfc}-${opp}`
}

async function pushToFans(db, roundId, title, body, icon, type) {
  const url = `${FANS_URL}/round?roundId=${roundId}`
  const fansSnap = await db.collection('fans').get()
  const sends = fansSnap.docs
    .filter(d => {
      const fan = d.data()
      if (!fan.fanPushSubscription) return false
      // If user has settings, check the specific toggle for this type
      if (type && fan.notificationSettings && fan.notificationSettings[type] === false) return false
      return true
    })
    .map(fanDoc =>
      webpush.sendNotification(
        fanDoc.data().fanPushSubscription,
        JSON.stringify({ title, body, url, icon: `${FANS_URL}/${icon}` })
      ).catch(err => {
        console.error(`Push failed for ${fanDoc.id}:`, err.statusCode ?? err.message)
        if (err.statusCode === 410 || err.statusCode === 404) {
          return fanDoc.ref.update({ fanPushSubscription: admin.firestore.FieldValue.delete() })
        }
      })
    )
  await Promise.allSettled(sends)
  return sends.length
}

// ── Push fans on all game events ──────────────────────────────────────────
exports.onGoalLogged = functions
  .region('australia-southeast1')
  .runWith({ secrets: ['VAPID_PRIVATE_KEY'] })
  .firestore
  .document('rounds/{roundId}/goals/{goalId}')
  .onCreate(async (snap, context) => {
    const goal = snap.data()
    const team = goal.team === 'seniors' ? 'Seniors' : 'Reserves'
    const type = goal.type  // undefined = goal (legacy), or kickoff/halftime/second_half/whistle

    webpush.setVapidDetails(
      'mailto:admin@keysboroughdistrict.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY.value().trim()
    )

    const db = admin.firestore()
    const roundId = context.params.roundId
    const score = await getScore(db, roundId, goal.team)

    let title, body, notifType
    let icon = 'icon-goal.svg'

    if (!type || type === 'goal') {
      if (goal.scoredBy === 'opponent') {
        const roundSnap = await db.doc(`rounds/${roundId}`).get()
        const opponent = roundSnap.exists ? (roundSnap.data().opponent ?? 'Opposition') : 'Opposition'
        title = `⚽ ${team} (${score})`
        body  = `${opponent} have scored`
        notifType = 'goalsOpp'
      } else {
        title = `⚽ ${team} (${score})`
        body  = goal.playerName   ? `KDFC Goal! ${goal.playerName} scores`
              : goal.playerNumber ? `KDFC Goal! #${goal.playerNumber} scores`
              : 'KDFC have scored!'
        notifType = 'goalsKDFC'
      }
      icon = 'icon-goal.svg'
    } else if (type === 'kickoff') {
      title = `🟢 ${team} (${score})`
      body  = 'Kick Off — match has started!'
      icon  = 'icon-play.svg'
      notifType = 'kickoff'
    } else if (type === 'halftime') {
      title = `⏸ ${team} (${score})`
      body  = 'Half Time'
      icon  = 'icon-halftime.svg'
      notifType = 'halftime'
    } else if (type === 'second_half') {
      title = `▶ ${team} (${score})`
      body  = '2nd Half underway!'
      icon  = 'icon-play.svg'
      notifType = 'kickoff'
    } else if (type === 'whistle') {
      title = `⏱ ${team} (${score})`
      body  = 'Full Time — check the result!'
      icon  = 'icon-whistle.svg'
      notifType = 'fulltime'
    } else {
      return  // unknown type, ignore
    }

    const sent = await pushToFans(db, roundId, title, body, icon, notifType)
    console.log(`Push [${type ?? 'goal'}] sent to ${sent} fans (type: ${notifType})`)
  })

// ── Push fans when a goal is deleted ─────────────────────────────────────
exports.onGoalDeleted = functions
  .region('australia-southeast1')
  .runWith({ secrets: ['VAPID_PRIVATE_KEY'] })
  .firestore
  .document('rounds/{roundId}/goals/{goalId}')
  .onDelete(async (snap, context) => {
    const goal = snap.data()
    // Only notify for actual goals, not phase events
    if (goal.type && goal.type !== 'goal') return

    webpush.setVapidDetails(
      'mailto:admin@keysboroughdistrict.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY.value().trim()
    )

    const db = admin.firestore()
    const roundId = context.params.roundId
    const team = goal.team === 'seniors' ? 'Seniors' : 'Reserves'
    const score = await getScore(db, roundId, goal.team)

    const title = `🔴 ${team} (${score})`
    const body  = goal.scoredBy === 'opponent'
      ? 'Opposition goal removed'
      : goal.playerName   ? `Goal removed — ${goal.playerName}`
      : goal.playerNumber ? `Goal removed — #${goal.playerNumber}`
      : 'KDFC goal removed'

    const notifType = goal.scoredBy === 'opponent' ? 'goalsOpp' : 'goalsKDFC'
    const sent = await pushToFans(db, roundId, title, body, 'icon-goal.svg', notifType)
    console.log(`Push [goal-deleted] sent to ${sent} fans`)
  })

// Manual notification trigger — called from admin teamsheet tab
exports.sendTeamNotification = onCall(
  { secrets: [VAPID_PRIVATE_KEY], region: 'australia-southeast1' },
  async (request) => {
    const { roundId, team } = request.data
    if (!roundId || !team) throw new Error('Missing roundId or team')

    webpush.setVapidDetails(
      'mailto:admin@keysboroughdistrict.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY.value().trim()
    )

    const db = admin.firestore()
    const roundSnap = await db.doc(`rounds/${roundId}`).get()
    if (!roundSnap.exists) throw new Error('Round not found')
    const round = roundSnap.data()

    const teamsheet = round.teamsheets?.[team] ?? []
    const sends = []
    let sent = 0

    for (const playerId of teamsheet) {
      const voteId = `${team}_${playerId}`
      const voteSnap = await db.doc(`rounds/${roundId}/votes/${voteId}`).get()
      if (voteSnap.exists) continue

      const playerSnap = await db.collection('players').doc(playerId).get()
      const player = playerSnap.data()
      if (!player?.pushSubscription) continue

      sent++
      sends.push(
        webpush.sendNotification(
          player.pushSubscription,
          JSON.stringify({
            title: 'Time to vote!',
            body: `${TEAM_LABEL[team]} vs ${round.opponent} — cast your 3-2-1 votes now`,
            url: APP_URL,
          })
        ).catch(err => {
          sent--
          console.error(`Failed to notify ${playerId}:`, err.statusCode ?? err.message)
          if (err.statusCode === 410 || err.statusCode === 404) {
            return db.collection('players').doc(playerId).update({ pushSubscription: admin.firestore.FieldValue.delete() })
          }
        })
      )
    }

    await Promise.allSettled(sends)
    return { sent }
  }
)

// ── PIN helpers ───────────────────────────────────────────────────────────────
const hashPin = (pin) => crypto.createHash('sha256').update(pin).digest('hex')

// ── setPin ────────────────────────────────────────────────────────────────────
// Sets (or resets) a player's PIN. Stores only the SHA-256 hash in the
// restricted /playerPins collection — raw PIN never persists anywhere.
//
// Request:  { playerId: string, pin: string }
// Response: {}
// ─────────────────────────────────────────────────────────────────────────────
exports.setPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { playerId, pin } = request.data
    if (!playerId || !pin) {
      throw new HttpsError('invalid-argument', 'playerId and pin are required')
    }

    const db = admin.firestore()
    const playerSnap = await db.collection('players').doc(playerId).get()
    if (!playerSnap.exists) {
      throw new HttpsError('not-found', 'Player not found')
    }

    // Reject if player already has a PIN set — use verifyPin + a change flow instead
    const existing = await db.collection('playerPins').doc(playerId).get()
    if (existing.exists) {
      throw new HttpsError('already-exists', 'PIN already set — use change PIN flow')
    }

    await db.collection('playerPins').doc(playerId).set({ pinHash: hashPin(pin) })
    // Set a flag on the player doc so clients know a PIN exists (without exposing the PIN)
    await db.collection('players').doc(playerId).update({ hasPin: true })
    return {}
  }
)

// ── verifyPin ─────────────────────────────────────────────────────────────────
// Verifies a player's PIN against the stored SHA-256 hash in /playerPins.
// Raw PIN is never stored or returned. /playerPins is inaccessible to clients.
//
// Request:  { playerId: string, pin: string }
// Response: { token: string }
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { playerId, pin } = request.data

    if (!playerId || !pin) {
      throw new HttpsError('invalid-argument', 'playerId and pin are required')
    }

    const db = admin.firestore()
    const [playerSnap, pinSnap] = await Promise.all([
      db.collection('players').doc(playerId).get(),
      db.collection('playerPins').doc(playerId).get(),
    ])

    if (!playerSnap.exists) {
      throw new HttpsError('not-found', 'Player not found')
    }
    if (!pinSnap.exists) {
      throw new HttpsError('not-found', 'PIN not set')
    }
    if (pinSnap.data().pinHash !== hashPin(pin)) {
      throw new HttpsError('permission-denied', 'Incorrect PIN')
    }

    const player = playerSnap.data()
    let token
    try {
      token = await admin.auth().createCustomToken(playerId, {
        role: player.role ?? 'player',
        team: player.team ?? null,
      })
    } catch (err) {
      console.error('createCustomToken failed:', err)
      throw new HttpsError('internal', 'Token creation failed: ' + err.message)
    }

    return { token }
  }
)

// ── setFanPin ─────────────────────────────────────────────────────────────────
exports.setFanPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { fanId, pin } = request.data
    if (!fanId || !pin) throw new HttpsError('invalid-argument', 'fanId and pin are required')

    const db = admin.firestore()
    const fanSnap = await db.collection('fans').doc(fanId).get()
    if (!fanSnap.exists) throw new HttpsError('not-found', 'Fan not found')

    const existing = await db.collection('fanPins').doc(fanId).get()
    if (existing.exists) throw new HttpsError('already-exists', 'PIN already set')

    await db.collection('fanPins').doc(fanId).set({ pinHash: hashPin(pin) })
    await db.collection('fans').doc(fanId).update({ hasPin: true, pin: admin.firestore.FieldValue.delete() })
    return {}
  }
)

// ── verifyFanPin ──────────────────────────────────────────────────────────────
exports.verifyFanPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { fanId, pin } = request.data
    if (!fanId || !pin) throw new HttpsError('invalid-argument', 'fanId and pin are required')

    const db = admin.firestore()
    const [fanSnap, pinSnap] = await Promise.all([
      db.collection('fans').doc(fanId).get(),
      db.collection('fanPins').doc(fanId).get(),
    ])

    if (!fanSnap.exists) throw new HttpsError('not-found', 'Fan not found')
    if (!pinSnap.exists) throw new HttpsError('not-found', 'PIN not set')
    if (pinSnap.data().pinHash !== hashPin(pin)) throw new HttpsError('permission-denied', 'Incorrect PIN')

    return {}
  }
)

// ── resetPin ──────────────────────────────────────────────────────────────────
// Clears a player's PIN so they can set a new one on next login.
// Two allowed callers:
//   1. Admin: pass adminPlayerId + adminPin (role=admin verified server-side)
//   2. Self change-PIN flow: pass playerId == callerPlayerId + callerPin (own PIN verified)
exports.resetPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { playerId, adminPlayerId, adminPin, callerPin } = request.data
    if (!playerId) throw new HttpsError('invalid-argument', 'playerId is required')

    const db = admin.firestore()

    if (adminPlayerId && adminPin) {
      // Admin path: verify the admin's PIN and check role=admin
      const [adminSnap, adminPinSnap] = await Promise.all([
        db.collection('players').doc(adminPlayerId).get(),
        db.collection('playerPins').doc(adminPlayerId).get(),
      ])
      if (!adminSnap.exists) throw new HttpsError('not-found', 'Admin player not found')
      if (adminSnap.data().role !== 'admin') throw new HttpsError('permission-denied', 'Not an admin')
      if (!adminPinSnap.exists || adminPinSnap.data().pinHash !== hashPin(adminPin)) {
        throw new HttpsError('permission-denied', 'Admin PIN incorrect')
      }
    } else if (callerPin) {
      // Self path: caller must prove they own this playerId by supplying their current PIN
      if (playerId !== request.data.playerId) throw new HttpsError('permission-denied', 'Forbidden')
      const pinSnap = await db.collection('playerPins').doc(playerId).get()
      if (!pinSnap.exists || pinSnap.data().pinHash !== hashPin(callerPin)) {
        throw new HttpsError('permission-denied', 'Current PIN incorrect')
      }
    } else {
      throw new HttpsError('permission-denied', 'Authorization required')
    }

    await db.collection('playerPins').doc(playerId).delete()
    await db.collection('players').doc(playerId).update({ hasPin: false })
    return {}
  }
)

// ── resetFanPin ───────────────────────────────────────────────────────────────
// Admin-triggered: clears a fan's PIN. Requires admin credentials.
exports.resetFanPin = onCall(
  { region: 'australia-southeast1' },
  async (request) => {
    const { fanId, adminPlayerId, adminPin } = request.data
    if (!fanId) throw new HttpsError('invalid-argument', 'fanId is required')
    if (!adminPlayerId || !adminPin) throw new HttpsError('permission-denied', 'Admin credentials required')

    const db = admin.firestore()
    const [adminSnap, adminPinSnap] = await Promise.all([
      db.collection('players').doc(adminPlayerId).get(),
      db.collection('playerPins').doc(adminPlayerId).get(),
    ])
    if (!adminSnap.exists) throw new HttpsError('not-found', 'Admin player not found')
    if (adminSnap.data().role !== 'admin') throw new HttpsError('permission-denied', 'Not an admin')
    if (!adminPinSnap.exists || adminPinSnap.data().pinHash !== hashPin(adminPin)) {
      throw new HttpsError('permission-denied', 'Admin PIN incorrect')
    }

    await db.collection('fanPins').doc(fanId).delete()
    await db.collection('fans').doc(fanId).update({ hasPin: false })
    return {}
  }
)
