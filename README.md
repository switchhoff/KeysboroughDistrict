# Keysborough District FC — MOTM Voting App

A mobile-first Progressive Web App (PWA) for Keysborough District Football Club.
Players vote for Man of the Match after each game using a 3-2-1 points system.
Coaches track goals, assists and results. Admins manage rounds, teamsheets and player lists.

**Live app:** https://keysborough-district-motm.web.app

---

## Features

- **MOTM Voting** — 3-2-1 points system, vote locked 90 minutes after kick-off
- **Leaderboard** — Votes, Goals and Assists tabs, round or season totals
- **Teamsheet management** — Admin assigns players to Seniors and Reserves each round
- **Stats tracking** — Goals and assists per player per round
- **Coach view** — Stats-only homepage, no voting
- **PWA** — Installable on Android and iOS, works offline
- **Push notifications** — Remind players to vote after the game (optional)
- **PIN-based auth** — Simple 4-digit PIN, no email/password required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, static export) |
| Styling | Tailwind CSS |
| Database | Firebase Firestore |
| Hosting | Firebase Hosting |
| Auth | Custom PIN (localStorage) |
| Notifications | Web Push API + Cloud Functions |
| Language | TypeScript |

---

## Project Structure

```
src/
  app/
    page.tsx          # Homepage (votes + stats tabs)
    login/            # PIN login
    vote/             # Cast/view votes
    admin/            # Admin panel (rounds, teamsheet, leaderboard, stats, players)
  components/
    Header.tsx
    Toast.tsx
    VoteTile.tsx
  lib/
    firebase.ts       # Firestore init
    auth.ts           # PIN auth helpers
    types.ts          # TypeScript interfaces
    pushNotifications.ts
public/
  sw.js               # Service worker
  manifest.json       # PWA manifest
  logo.png            # Club logo
functions/
  index.js            # Cloud Functions (vote reminders, push notifications)
firestore.rules       # Security rules
```

---

## Roles

| Role | Teamsheet | Leaderboard | Admin Panel | Home Screen |
|---|---|---|---|---|
| `player` | ✅ | ✅ | ❌ | Votes + Stats |
| `admin` | ✅ | ✅ | ✅ | Votes + Stats |
| `coach` | ❌ | ❌ | ❌ | Stats only |

Admin and superadmin roles are set via Firebase console only — not writable by the app.

---

## Development

```bash
npm install
npm run dev        # Local dev server at localhost:3000
npm run build      # Static export to out/
```

## Deployment

```bash
firebase deploy --only hosting          # Deploy app
firebase deploy --only firestore:rules  # Deploy security rules
firebase deploy --only functions        # Deploy Cloud Functions
```

Requires Firebase CLI and access to the `keysborough-district` Firebase project.

---

## Security

- Players can only update their own `pin` field in Firestore
- Admin/superadmin roles are set via Firebase console only
- Vote document IDs are scoped per player per team per round

---

## This App Is Production — Do Not Modify

This codebase is deployed and in use. It is the reference implementation for the
VoteMOTM platform. For new club deployments or feature development, see the
[VoteMOTM](../VoteMOTM) project.
