/**
 * Migration: move plaintext PINs from players/{id}.pin
 * to hashed entries in playerPins/{id}.pinHash
 *
 * Run once:  node scripts/migrate-pins.js
 * Safe to re-run — skips players that already have a playerPins entry.
 */

const admin = require('firebase-admin')
const crypto = require('crypto')
const serviceAccount = require('../service-account.json')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const db = admin.firestore()
const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex')

async function migrate() {
  const playersSnap = await db.collection('players').get()
  let migrated = 0, skipped = 0, noPinCount = 0

  for (const playerDoc of playersSnap.docs) {
    const player = playerDoc.data()

    if (!player.pin) {
      noPinCount++
      continue
    }

    // Check if already migrated
    const existing = await db.collection('playerPins').doc(playerDoc.id).get()
    if (existing.exists) {
      console.log(`  skip  ${player.name} — already migrated`)
      skipped++
      continue
    }

    const pinHash = hashPin(player.pin)
    await db.collection('playerPins').doc(playerDoc.id).set({ pinHash })

    // Remove plaintext pin, set hasPin flag on players doc
    await playerDoc.ref.update({
      pin: admin.firestore.FieldValue.delete(),
      hasPin: true,
    })

    console.log(`  ✓  ${player.name}`)
    migrated++
  }

  console.log(`\nDone. Migrated: ${migrated}  Skipped: ${skipped}  No PIN: ${noPinCount}`)
  process.exit(0)
}

migrate().catch(err => { console.error(err); process.exit(1) })
