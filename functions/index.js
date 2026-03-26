const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const webpush = require('web-push')

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
