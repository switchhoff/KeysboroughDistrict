/**
 * Migration: move plaintext PINs from fans/{id}.pin
 * to hashed entries in fanPins/{id}.pinHash
 *
 * Run once:  node scripts/migrate-fan-pins.js
 * Safe to re-run — skips fans that already have a fanPins entry.
 */

const admin = require('firebase-admin')
const crypto = require('crypto')
const serviceAccount = require('../service-account.json')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const db = admin.firestore()
const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex')

async function migrate() {
  const fansSnap = await db.collection('fans').get()
  let migrated = 0, skipped = 0, noPinCount = 0

  for (const fanDoc of fansSnap.docs) {
    const fan = fanDoc.data()

    if (!fan.pin) {
      noPinCount++
      continue
    }

    const existing = await db.collection('fanPins').doc(fanDoc.id).get()
    if (existing.exists) {
      console.log(`  skip  ${fan.name} — already migrated`)
      skipped++
      continue
    }

    await db.collection('fanPins').doc(fanDoc.id).set({ pinHash: hashPin(fan.pin) })
    await fanDoc.ref.update({
      pin: admin.firestore.FieldValue.delete(),
      hasPin: true,
    })

    console.log(`  ✓  ${fan.name}`)
    migrated++
  }

  console.log(`\nDone. Migrated: ${migrated}  Skipped: ${skipped}  No PIN: ${noPinCount}`)
  process.exit(0)
}

migrate().catch(err => { console.error(err); process.exit(1) })
