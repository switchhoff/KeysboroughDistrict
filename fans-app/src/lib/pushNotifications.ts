import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from './firebase'

const VAPID_PUBLIC_KEY = 'BI_FH8gYwoLpSjktEdJ6e3vfxyYFlFiUPW2QQ62pnif7hglCV6qZiAFQVFkJ5G0crVBDSq7SEzSYVzuxSdigaOs'

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export type PushState = 'unsupported' | 'denied' | 'granted' | 'default'

export function getPushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  return Notification.permission as PushState
}

export async function subscribeToPush(fanId: string): Promise<boolean> {
  if (getPushState() === 'unsupported') return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
  })

  await updateDoc(doc(db, 'fans', fanId), { fanPushSubscription: sub.toJSON() })
  return true
}

export async function unsubscribeFromPush(fanId: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
  await updateDoc(doc(db, 'fans', fanId), { fanPushSubscription: deleteField() })
}
