// v3
const ORIGIN = 'https://keysborough-district-motm.web.app'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'KDFC MOTM', {
      body: data.body ?? 'Time to submit your votes!',
      icon: `${ORIGIN}/logo.png`,
      badge: `${ORIGIN}/badge96.png`,
      data: { url: data.url ?? ORIGIN },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})
